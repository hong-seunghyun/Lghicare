// pages/_app.tsx
import type { AppProps } from "next/app";
import Script from "next/script";
import Layout from "@/components/Layout/Layout";
import { createGlobalStyle, ThemeProvider } from "styled-components";
import { useRouter } from "next/router";

import AdminLayout from "@/components/AdminLayout/AdminLayout";
import ManagerLayout from "@/components/ManagerLayout/ManagerLayout";
import { UserProvider } from "@/contexts/UserContext";

import "react-quill/dist/quill.snow.css";

const GlobalStyle = createGlobalStyle`
* {
    margin: 0;
    padding: 0;
    font-family: 'Noto Sans KR', sans-serif;
    box-sizing: border-box;
    color: #333;
  }
  body {
    word-break: keep-all;
    background-color:#fff;
  }
  a{
    color: inherit;
    text-decoration: none;
    font-size: inherit;
    font-weight: inherit;
  }
  h1,h2,h3,h4,h5,h6,b,p,span,strong{
    color: inherit;
    font-size: inherit;
  }
    ol,ul{
    list-style: none;
    }
    input,button,textarea{
        font-size: inherit;
        font-family: inherit;
        outline: none;
        border: none;
        background: none;
    }
`;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const isAdminRoute = router.pathname.startsWith("/admin");
  const isAdminLoginRoute = router.pathname === "/admin/login";

  const isManagerRoute = router.pathname.startsWith("/manager");
  const isManagerLoginRoute = router.pathname === "/manager/login";

  return (
    <ThemeProvider theme={{}}>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}');
        `}
      </Script>
      <GlobalStyle />
      <UserProvider>
        {isAdminLoginRoute || isManagerLoginRoute ? (
          //  /admin/login, /manager/login 은 공용/메인 레이아웃 없이 단독 페이지
          <Component {...pageProps} />
        ) : isAdminRoute ? (
          //  관리자 전용 레이아웃
          <AdminLayout>
            <Component {...pageProps} />
          </AdminLayout>
        ) : isManagerRoute ? (
          //  매니저 전용 레이아웃
          <ManagerLayout>
            <Component {...pageProps} />
          </ManagerLayout>
        ) : (
          //  일반 사용자 레이아웃
          <Layout>
            <Component {...pageProps} />
          </Layout>
        )}
      </UserProvider>
    </ThemeProvider>
  );
}
