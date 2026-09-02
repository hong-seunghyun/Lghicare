import { useMemo, useState } from "react";
import styled from "styled-components";
import type { ServiceArea } from "@/data/serviceAreas";
import { koreaRegions, type KoreaRegion } from "@/data/koreaRegions";
import { koreaMapShapes } from "@/data/koreaMapShapes";
import { cityMapPositions } from "@/data/cityMapPositions";

type Props = { areas: ServiceArea[] };

const normalize = (value: string) =>
  value.replace(/[\s·,()~.\-]/g, "").toLowerCase();

const ambiguousDistricts = new Set(["중구", "동구", "서구", "남구", "북구", "강서구"]);

const matchesCity = (area: ServiceArea, region: KoreaRegion, city: string) => {
  const target = normalize(`${area.office}${area.area}`);
  const cityName = normalize(city);
  const baseName = normalize(city.replace(/(특별자치시|시|군|구)$/u, ""));

  if (region.type === "metro" && ambiguousDistricts.has(city)) {
    const hasRegionMarker = target.includes(normalize(region.shortName));
    if (hasRegionMarker && target.includes(cityName)) return true;

    if (region.id === "seoul") {
      const hasOtherMetroMarker = koreaRegions.some(
        (other) =>
          other.type === "metro" &&
          other.id !== "seoul" &&
          target.includes(normalize(other.shortName)),
      );
      return !hasOtherMetroMarker && target.includes(cityName);
    }

    return false;
  }

  if (region.id === "gyeonggi" && city === "광주시") {
    return target.includes(cityName) || target.includes("경기광주");
  }

  return target.includes(cityName) || (baseName.length >= 2 && target.includes(baseName));
};

const uniqueBranches = (items: ServiceArea[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.manager}|${item.office}|${item.phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function ServiceAreaMap({ areas }: Props) {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);

  const selectedRegion = useMemo(
    () => koreaRegions.find((region) => region.id === selectedRegionId) ?? null,
    [selectedRegionId],
  );
  const selectedShape = selectedRegion ? koreaMapShapes[selectedRegion.id] : null;

  const cityBranches = useMemo(() => {
    const result = new Map<string, ServiceArea[]>();
    koreaRegions.forEach((region) => {
      region.cities.forEach((city) => {
        result.set(
          `${region.id}:${city}`,
          uniqueBranches(areas.filter((area) => matchesCity(area, region, city))),
        );
      });
    });
    return result;
  }, [areas]);

  const getRegionBranches = (region: KoreaRegion) =>
    uniqueBranches(
      region.cities.flatMap((city) => cityBranches.get(`${region.id}:${city}`) ?? []),
    );

  const visibleBranches = useMemo(() => {
    if (!selectedRegion) return [];
    if (selectedCity) return cityBranches.get(`${selectedRegion.id}:${selectedCity}`) ?? [];
    return getRegionBranches(selectedRegion);
  // cityBranches contains the complete derived index for the current areas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityBranches, selectedCity, selectedRegion]);

  const selectRegion = (region: KoreaRegion) => {
    setSelectedRegionId(region.id);
    setSelectedCity(null);
  };

  const goBack = () => {
    setSelectedRegionId(null);
    setSelectedCity(null);
  };

  return (
    <Section>
      <SectionHeader>
        <div>
          <Eyebrow>INTERACTIVE MAP</Eyebrow>
          <h2>지도로 관할 사무소 찾기</h2>
          <p>지역을 선택하면 해당 시·군·구와 가까운 사무소를 확인할 수 있어요.</p>
        </div>
        <Legend>
          <span><i className="active" />지점 있음</span>
          <span><i />지점 없음</span>
        </Legend>
      </SectionHeader>

      <MapLayout>
        <MapPanel>
          {!selectedRegion ? (
            <>
              <MapPanelTitle><b>방문 지역을 선택해 주세요</b><span>전국 17개 시·도</span></MapPanelTitle>
              <KoreaMap viewBox="0 0 490 546" role="img" aria-label="대한민국 시도 선택 지도">
                <image href="/images/service-area-map/korea.png" x="0" y="0" width="490" height="546" />
                {koreaRegions.map((region) => {
                  const count = getRegionBranches(region).length;
                  const shape = koreaMapShapes[region.id];
                  return (
                    <g
                      key={region.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${region.name}, 지점 ${count}개`}
                      onClick={() => selectRegion(region)}
                      onMouseEnter={() => setHoveredRegionId(region.id)}
                      onMouseLeave={() => setHoveredRegionId(null)}
                      onFocus={() => setHoveredRegionId(region.id)}
                      onBlur={() => setHoveredRegionId(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") selectRegion(region);
                      }}
                    >
                      <RegionPath points={shape.coords} $hasBranch={count > 0} />
                    </g>
                  );
                })}
                <RegionLabelLayer aria-hidden="true">
                  {koreaRegions.map((region) => {
                    const count = getRegionBranches(region).length;
                    const shape = koreaMapShapes[region.id];
                    const isHovered = hoveredRegionId === region.id;
                    return (
                      <g key={`label-${region.id}`}>
                        <RegionName
                          x={shape.label[0]}
                          y={shape.label[1]}
                          $hasBranch={count > 0}
                          $hovered={isHovered}
                        >
                          {region.shortName}
                        </RegionName>
                        {count > 0 && (
                          <RegionStatusLine
                            x1={shape.label[0] - 9}
                            x2={shape.label[0] + 9}
                            y1={shape.label[1] + 8}
                            y2={shape.label[1] + 8}
                            $hovered={isHovered}
                          />
                        )}
                      </g>
                    );
                  })}
                </RegionLabelLayer>
              </KoreaMap>
              <MapHelp>지도를 클릭해 세부 지역을 확인하세요</MapHelp>
            </>
          ) : (
            <RegionView>
              <RegionTop>
                <BackButton type="button" onClick={goBack}>← 전국지도</BackButton>
                <div><b>{selectedRegion.name}</b><span>시·군·구를 선택해 주세요</span></div>
              </RegionTop>
              <RegionMapBody>
                {selectedShape && (
                  <RegionMapCanvas>
                    <RegionMapImage src={selectedShape.image} alt={`${selectedRegion.name} 행정구역 지도`} />
                    <CityLabels>
                      {selectedRegion.cities.map((city) => {
                        const count = cityBranches.get(`${selectedRegion.id}:${city}`)?.length ?? 0;
                        const position = cityMapPositions[selectedRegion.id]?.[city] ?? [273, 245];
                        const horizontal = position[1];
                        return (
                          <CityLabel
                            key={city}
                            type="button"
                            disabled={count === 0}
                            $active={selectedCity === city}
                            $hasBranch={count > 0}
                            style={{
                              top: `${(position[0] / 546) * 100}%`,
                              ...(horizontal >= 0
                                ? { left: `${(horizontal / 490) * 100}%` }
                                : { right: `${(Math.abs(horizontal) / 490) * 100}%` }),
                            }}
                            title={count > 0 ? `${city} 사무소 보기` : `${city} 등록 사무소 없음`}
                            onClick={() => setSelectedCity(selectedCity === city ? null : city)}
                          >
                            {city.replace(/특별자치시$/u, "시")}
                          </CityLabel>
                        );
                      })}
                    </CityLabels>
                  </RegionMapCanvas>
                )}
              </RegionMapBody>
              <RegionSummary>
                <button type="button" className={!selectedCity ? "active" : ""} onClick={() => setSelectedCity(null)}>
                  {selectedRegion.shortName} 전체
                </button>
                <span>{getRegionBranches(selectedRegion).length}개 사무소</span>
              </RegionSummary>
            </RegionView>
          )}
        </MapPanel>

        <BranchPanel>
          <BranchHeader>
            <div>
              <span>{selectedRegion ? selectedRegion.shortName : "관할지역"}</span>
              <h3>{selectedCity ? `${selectedCity} 사무소` : selectedRegion ? `${selectedRegion.name} 전체 사무소` : "지역별 사무소 안내"}</h3>
            </div>
            {selectedRegion && <BranchCount>{visibleBranches.length}개</BranchCount>}
          </BranchHeader>

          {!selectedRegion ? (
            <GuideState>
              <MapPinIcon>⌖</MapPinIcon>
              <b>지도에서 지역을 선택해 주세요</b>
              <p>시·도를 선택하면 해당 지역의<br />관할 사무소가 여기에 표시됩니다.</p>
            </GuideState>
          ) : visibleBranches.length > 0 ? (
            <BranchList>
              {visibleBranches.map((branch) => (
                <BranchCard key={`${branch.manager}-${branch.office}-${branch.phone}`}>
                  <BranchCardTop>
                    <div><span>{branch.manager} 담당</span><h4>{branch.office} 사무소</h4></div>
                    <a href={`tel:${branch.phone}`}>전화하기</a>
                  </BranchCardTop>
                  <p>{branch.area}</p>
                  <strong>{branch.phone}</strong>
                </BranchCard>
              ))}
            </BranchList>
          ) : (
            <GuideState>
              <MapPinIcon>–</MapPinIcon>
              <b>등록된 사무소가 없습니다</b>
              <p>다른 지역을 선택하거나<br />지역명 검색을 이용해 주세요.</p>
            </GuideState>
          )}
        </BranchPanel>
      </MapLayout>
    </Section>
  );
}

const Section = styled.section`margin-bottom:72px;`;
const SectionHeader = styled.div`
  display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:26px;
  h2{font-size:30px;letter-spacing:-1.1px;margin:9px 0 9px;color:#171719}p{font-size:14px;color:#7d7d85}
  @media(max-width:720px){display:block;margin-bottom:18px;h2{font-size:23px}p{font-size:12px;line-height:1.55}}
`;
const Eyebrow = styled.span`font-size:11px;letter-spacing:2px;font-weight:800;color:#a50034;`;
const Legend = styled.div`
  display:flex;gap:16px;padding:9px 12px;border:1px solid #ededf0;border-radius:999px;background:#fff;font-size:11px;color:#85858d;flex:none;span{display:flex;align-items:center;gap:7px}i{width:9px;height:9px;border-radius:50%;background:#d9dade}i.active{background:#a50034;box-shadow:0 0 0 4px rgba(165,0,52,.08)}
  @media(max-width:720px){margin-top:14px}
`;
const MapLayout = styled.div`
  display:grid;grid-template-columns:minmax(430px,.9fr) minmax(490px,1.1fr);min-height:650px;border:1px solid #e7e7eb;border-radius:30px;overflow:hidden;background:#fff;box-shadow:0 24px 70px rgba(25,22,27,.08);
  @media(max-width:900px){grid-template-columns:1fr;min-height:0}
`;
const MapPanel = styled.div`position:relative;padding:34px;background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.96),rgba(255,255,255,0) 42%),linear-gradient(145deg,#f8f7f8,#f1eff1);border-right:1px solid #e8e6e8;min-height:650px;@media(max-width:900px){border-right:0;border-bottom:1px solid #e7e4e4;min-height:620px}@media(max-width:520px){padding:22px 16px;min-height:570px}`;
const MapPanelTitle = styled.div`position:absolute;left:34px;top:32px;z-index:2;b{display:block;font-size:18px;letter-spacing:-.4px;margin-bottom:6px}span{font-size:11px;color:#9a99a0}@media(max-width:520px){left:18px;top:20px}`;
const KoreaMap = styled.svg`display:block;width:100%;height:530px;margin-top:36px;overflow:visible;filter:drop-shadow(0 12px 18px rgba(28,21,24,.06));g{cursor:pointer;outline:none;transform-box:fill-box;transform-origin:center;transition:transform .3s cubic-bezier(.2,.8,.2,1),filter .3s ease}g:hover,g:focus{transform:translateY(-4px);filter:drop-shadow(0 9px 8px rgba(165,0,52,.18))}g:hover polygon,g:focus polygon{fill:#f8e9ee;stroke:#a50034;stroke-width:2}g:focus-visible{outline:none}`;
const RegionPath = styled.polygon<{ $hasBranch:boolean }>`fill:#fff;stroke:${({$hasBranch})=>$hasBranch?"rgba(165,0,52,.28)":"#c8c8cd"};stroke-width:1.15;transition:fill .28s ease,stroke .28s ease;`;
const RegionLabelLayer = styled.g`pointer-events:none;g{cursor:default!important;filter:none!important}`;
const RegionName = styled.text<{ $hasBranch:boolean;$hovered:boolean }>`fill:${({$hasBranch,$hovered})=>$hovered?"#790028":$hasBranch?"#242127":"#48474d"};stroke:#fff;stroke-width:4px;paint-order:stroke fill;font-size:15.5px;font-weight:850;letter-spacing:-.45px;text-anchor:middle;pointer-events:none;transform:${({$hovered})=>$hovered?"translateY(-2px)":"none"};transform-box:fill-box;transform-origin:center;transition:fill .25s ease,transform .3s cubic-bezier(.2,.8,.2,1);`;
const RegionStatusLine = styled.line<{ $hovered:boolean }>`stroke:#a50034;stroke-width:3.5;stroke-linecap:round;pointer-events:none;transform:${({$hovered})=>$hovered?"translateY(-2px)":"none"};transition:transform .3s cubic-bezier(.2,.8,.2,1);`;
const MapHelp = styled.p`position:absolute;left:0;right:0;bottom:23px;text-align:center;font-size:11px;color:#999;`;
const RegionView = styled.div`height:100%;display:flex;flex-direction:column;`;
const RegionTop = styled.div`
  display:flex;align-items:center;gap:18px;div b{display:block;font-size:22px;letter-spacing:-.5px;margin-bottom:5px}div span{font-size:12px;color:#96949a}
`;
const BackButton = styled.button`height:38px;padding:0 15px;border:1px solid #dedde1;border-radius:999px;background:rgba(255,255,255,.85);color:#5c5b62;font-size:12px;cursor:pointer;transition:.2s;&:hover{border-color:#a50034;color:#a50034;box-shadow:0 7px 18px rgba(165,0,52,.1);transform:translateX(-2px)}`;
const RegionMapBody = styled.div`position:relative;flex:1;display:flex;align-items:center;justify-content:center;margin:20px 0;overflow:hidden;border:1px solid rgba(229,227,230,.85);border-radius:24px;background:rgba(255,255,255,.52);min-height:480px;box-shadow:inset 0 1px 0 rgba(255,255,255,.8);`;
const RegionMapCanvas = styled.div`position:relative;height:100%;max-height:520px;aspect-ratio:490/546;max-width:100%;`;
const RegionMapImage = styled.img`position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;`;
const CityLabels = styled.div`position:absolute;inset:0;z-index:1;`;
const CityLabel = styled.button<{ $active:boolean;$hasBranch:boolean }>`
  position:absolute;z-index:${({$active})=>$active?3:1};padding:4px 6px;border:0;border-radius:7px;background:${({$active})=>$active?"#a50034":"transparent"};color:${({$active,$hasBranch})=>$active?"#fff":$hasBranch?"#201e23":"#66656c"};font-size:13px;line-height:1.15;font-weight:${({$hasBranch})=>$hasBranch?800:650};letter-spacing:-.35px;white-space:nowrap;cursor:${({$hasBranch})=>$hasBranch?"pointer":"default"};text-shadow:${({$active})=>$active?"none":"-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 2px 3px rgba(255,255,255,.95)"};transition:color .2s ease,background .2s ease,transform .24s cubic-bezier(.2,.8,.2,1),box-shadow .2s ease;
  &::before{content:"";display:${({$hasBranch,$active})=>$hasBranch&&!$active?"inline-block":"none"};width:5px;height:5px;margin:0 5px 2px 0;border-radius:50%;background:#a50034;box-shadow:0 0 0 2px rgba(255,255,255,.9)}
  &:hover:not(:disabled){z-index:10;color:#790028;background:rgba(255,255,255,.96);box-shadow:0 8px 20px rgba(63,27,39,.16);transform:translateY(-3px) scale(1.05);text-shadow:none}
  &:focus-visible{outline:2px solid #a50034;outline-offset:2px}
  @media(max-width:520px){font-size:11px;padding:3px 4px}
`;
const RegionSummary = styled.div`display:flex;align-items:center;justify-content:space-between;padding-top:17px;border-top:1px solid #dedde1;font-size:12px;color:#85838a;button{padding:9px 14px;border-radius:999px;color:#666;cursor:pointer;transition:.2s}button.active{background:#222;color:#fff;box-shadow:0 5px 14px rgba(0,0,0,.14)}`;
const BranchPanel = styled.div`display:flex;flex-direction:column;min-width:0;padding:34px;background:linear-gradient(180deg,#fff 0%,#fcfbfc 100%);@media(max-width:520px){padding:24px 16px}`;
const BranchHeader = styled.div`display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:22px;border-bottom:1px solid #e8e7ea;span{font-size:11px;letter-spacing:.5px;color:#a50034;font-weight:800}h3{font-size:23px;letter-spacing:-.7px;margin-top:6px}`;
const BranchCount = styled.b`font-size:12px;color:#a50034;padding:8px 13px;border-radius:999px;background:#f8edf1;border:1px solid #f0dce3;`;
const BranchList = styled.div`display:grid;grid-template-columns:1fr;gap:12px;margin-top:20px;max-height:540px;overflow-y:auto;padding:2px 8px 2px 2px;scrollbar-color:#c9c7cb transparent;scrollbar-width:thin;`;
const BranchCard = styled.article`position:relative;min-width:0;padding:21px 22px 19px;border:1px solid #e7e6e9;border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(35,29,32,.035);transition:border-color .2s ease,box-shadow .25s ease,transform .25s ease;&::before{content:"";position:absolute;left:-1px;top:19px;bottom:19px;width:3px;border-radius:0 3px 3px 0;background:#a50034;opacity:.15;transition:.2s}&:hover{border-color:#d9b0bd;box-shadow:0 15px 32px rgba(79,26,43,.09);transform:translateY(-2px)}&:hover::before{opacity:1}p{min-height:0;margin:15px 0 13px;padding:13px 14px;border-radius:12px;background:#f7f7f8;color:#66646b;font-size:13px;line-height:1.65;word-break:keep-all}strong{font-size:14px;letter-spacing:.1px;color:#36343a}`;
const BranchCardTop = styled.div`display:flex;align-items:flex-start;justify-content:space-between;gap:16px;span{display:block;font-size:13px;line-height:1.35;color:#a50034;font-weight:750;letter-spacing:-.2px}h4{font-size:18px;letter-spacing:-.4px;margin-top:6px}a{flex:none;padding:8px 11px;border-radius:9px;background:#f8edf1;color:#a50034;font-size:11px;font-weight:800;transition:.2s;&:hover{background:#a50034;color:#fff;box-shadow:0 6px 14px rgba(165,0,52,.2)}}`;
const GuideState = styled.div`flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;color:#888;min-height:430px;b{font-size:16px;color:#444;margin:15px 0 8px}p{font-size:12px;line-height:1.65}`;
const MapPinIcon = styled.span`width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:#f7f2f3;color:#a50034;font-size:27px;`;
