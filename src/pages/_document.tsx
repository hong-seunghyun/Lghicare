// pages/_document.tsx
import Document, {
  DocumentContext,
  Html,
  Head,
  Main,
  NextScript,
} from "next/document";
import { ServerStyleSheet } from "styled-components";
import type { AppType } from "next/app";
import Script from "next/script";

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const sheet = new ServerStyleSheet();
    const originalRenderPage = ctx.renderPage;

    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp: (App: AppType) => (props) =>
            sheet.collectStyles(<App {...props} />),
        });

      const initialProps = await Document.getInitialProps(ctx);

      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            {sheet.getStyleElement()}
          </>
        ),
      };
    } finally {
      sheet.seal();
    }
  }

  render() {
    return (
      <Html lang="ko">
        <Head>
          {/* ✅ Google Fonts - Noto Sans KR */}
          <link
            href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800;900&display=swap"
            rel="stylesheet"
          />
          <meta name="description" content="LG전자 하이케어솔루션"></meta>
          <meta name="keywords" content="LG전자 하이케어솔루션"></meta>
          <title>LG하이케어솔루션</title>
          <link rel="icon" href="/favicon.ico"></link>
          <Script src="/smarteditor2/js/service/HuskyEZCreator.js" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
