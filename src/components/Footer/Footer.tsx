import styled from "styled-components";

export default function Footer() {
  return (
    <FooterContainer>
      <FooterInner>
        <CompanyInfo>
          <p>
            상호명 <b>하이케어솔루션</b> 대표자명 <b>손대기</b> 사업장 주소{" "}
            <b>서울특별시 강서구 마곡중앙5로 18(마곡동)</b>
          </p>
          <p>
            대표 전화 <b>1544-7777</b> 사업자 등록번호 <b>460-81-02233</b>
          </p>
        </CompanyInfo>
        <Divider />
        <CopyRight>
          Copyright © 하이케어솔루션, All Rights Reserved. Hosting by Cafe24
          Corp.
        </CopyRight>
      </FooterInner>
    </FooterContainer>
  );
}

const FooterContainer = styled.footer`
  background-color: #f8f8f8;
  padding: 30px 0;
  margin-top: 60px;
`;

const FooterInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 20px;
  text-align: center;
  color: #333;
  font-size: 13px;
  line-height: 1.6;
`;

const CompanyInfo = styled.div`
  p {
    margin: 0;
  }
  b {
    font-weight: 600;
  }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid #ddd;
  margin: 16px 0;
`;

const CopyRight = styled.div`
  font-size: 12px;
  color: #777;
`;
