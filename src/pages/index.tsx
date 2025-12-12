import Link from "next/link";
import styled from "styled-components";
import BestProductSection from "@/components/BestProductSection";

export default function Home() {
  return (
    <Main>
      <BannerSection></BannerSection>

      <ContetnSection>
        <CaresolutionSection>
          <Guide>
            <Link href="#">
              <Tit>서비스 안내</Tit>
              <SolutionText>
                가전 구독이 왜 좋은지
                <br />
                알아볼까요?
              </SolutionText>
            </Link>
          </Guide>
          <LinkBoxWrap>
            <Card>
              <Link href="#">
                <Tit>혜택 안내</Tit>
                <SolutionText>
                  <span>구독할 때 </span>어떤 혜택을
                  <br />
                  받을 수 있을까요?
                </SolutionText>
              </Link>
            </Card>
            <Etimate>
              <Link href="#">
                <Tit>견적내기</Tit>
                <SolutionText>
                  내가 고른 구독,
                  <br />
                  얼마일까요?
                </SolutionText>
              </Link>
            </Etimate>
          </LinkBoxWrap>
        </CaresolutionSection>

        <BestProductSection />
      </ContetnSection>
    </Main>
  );
}

const Main = styled.div`
  margin: 0;
  padding: 0;
`;

const BannerSection = styled.div``;

const ContetnSection = styled.div``;

const CaresolutionSection = styled.div`
  max-width: 1476px;
  margin: 50px auto 80px;
  padding: 0 48px;
  display: flex;

  @media (max-width: 1280px) {
    flex-wrap: wrap;
  }

  @media (max-width: 767px) {
    margin: 24px 0 0;
    padding: 0 16px;
  }
`;

const Guide = styled.div`
  width: 100%;
  background: linear-gradient(180deg, #fff3f2 0, #ffe5e4 100%);
  border-radius: 1.073826vw;
  overflow: hidden;
  position: relative;
  flex-basis: 503px;
  aspect-ratio: 1 / 0.4374;
  margin-right: 24px;

  p {
    background-color: #e21024;
  }

  a {
    position: relative;
    width: 100%;
    height: 100%;
    display: block;

    padding: 32px;

    &::after {
      content: "";
      display: block;
      position: absolute;
      bottom: 30px;
      right: 28px;
      width: 176px;
      height: 130px;
      background: url("/images/img_rental01.avif") no-repeat 0 0 / cover;
    }
  }

  @media (max-width: 1280px) {
    margin-right: 0;
    margin-bottom: 1.875vw;
    width: 100%;
    aspect-ratio: auto;
    flex-basis: auto;
    border-radius: 1.073826vw;

    a {
      padding: 3.125vw 0 7.0615vw 2.5vw;

      &::after {
        right: 4.296875vw;
        width: 17.578125vw;
        height: 13.21vw;
      }
    }
  }

  @media (max-width: 767px) {
    margin-right: 8px;
    margin-bottom: 0;
    width: calc((100% - 8px) / 2);
    aspect-ratio: auto;

    a {
      padding: 14px;
      display: block;
      width: 100%;
      height: 100%;

      &::after {
        width: 130px;
        height: 100px;
        right: auto;
        left: 70%;
        transform: translateX(-50%);
        bottom: 15px;
      }
    }
  }
`;

const Tit = styled.p`
  display: inline-block;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 400;
  border-radius: 20px;
  color: #fff;

    @media (max-width: 767px) {
      font-size: 10px;
        line-height: 1.448333;
        padding: 3px 8px;
    }
}
`;

const SolutionText = styled.div`
  letter-spacing: -0.054687vw;
  position: relative;
  display: block;
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.447916;
  z-index: 2;

  @media (max-width: 767px) {
    width: 100%;
    min-width: 106px;
    letter-spacing: -0.7px;
    margin-top: 6px;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.357142;
  }

  @media (max-width: 499px) {
    span {
      display: none;
    }
  }
`;

const LinkBoxWrap = styled.div`
  display: flex;
  width: 853px;
  gap: 24px;

  @media (max-width: 1280px) {
    width: 100%;
    gap: 24px;
  }

  @media (max-width: 767px) {
    display: flex;
    flex-direction: column;
    width: calc((100% - 8px) / 2);
    gap: 8px;
  }
`;

const Card = styled.div`
  position: relative;
  flex-basis: 503px;
  border-radius: 16px;
  overflow: hidden;
  aspect-ratio: 1 / 0.4374;
  background: linear-gradient(180deg, #fafafa 0, #e6f2f2 100%);

  p {
    background-color: #3c5d5d;
  }

  a {
    position: relative;
    width: 100%;
    height: 100%;
    display: block;

    padding: 32px;

    &::after {
      content: "";
      display: block;
      position: absolute;
      bottom: 30px;
      right: 0;
      width: 130px;
      height: 107px;
      background: url("/images/img_card01.avif") no-repeat 0 0 / cover;
    }
  }

  @media (max-width: 1280px) {
    width: 50%;
    flex-basis: auto;
    aspect-ratio: auto;
    border-radius: 1.073826vw;

    a {
      padding: 3.125vw 0 7.0615vw 2.5vw;

      &::after {
        bottom: 0;
        right: 0;
        width: 9vw;
        height: 9vw;
      }
    }
  }

  @media (max-width: 767px) {
    width: 100%;
    height: 110px;

    a {
      padding: 14px;
      display: block;
      width: 100%;
      height: 100%;

      &::after {
        width: 80px;
        height: 50px;
        right: -19px;
        bottom: -5px;
      }
    }
  }
`;

const Etimate = styled.div`
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  aspect-ratio: 1 / 0.4374;
  flex-basis: 326px;
  background: linear-gradient(180deg, #fafafa 0, #f0f0f0 100%);
  p {
    background-color: #1a1a1a;
  }

  a {
    position: relative;
    width: 100%;
    height: 100%;
    display: block;

    padding: 32px;

    &::after {
      content: "";
      display: block;
      position: absolute;
      bottom: 30px;
      right: 0;
      width: 120px;
      height: 107px;
      background: url("/images/img_estimate01.avif") no-repeat 0 0 / cover;
    }
  }

  @media (max-width: 1280px) {
    width: 50%;
    flex-basis: auto;
    aspect-ratio: auto;
    border-radius: 1.073826vw;

    a {
      padding: 3.125vw 0 7.0615vw 2.5vw;

      &::after {
        bottom: 0;
        right: 0;
        width: 9vw;
        height: 9vw;
      }
    }
  }

  @media (max-width: 767px) {
    width: 100%;
    height: 110px;

    a {
      padding: 14px;
      display: block;
      width: 100%;
      height: 100%;

      &::after {
        width: 80px;
        height: 50px;
        right: -20px;
        bottom: -5px;
      }
    }
  }
`;

const dd = styled.div``;
