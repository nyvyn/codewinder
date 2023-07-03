import "@fontsource-variable/public-sans";
import "bootstrap-icons/font/bootstrap-icons.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";

export default function App({Component, pageProps}: AppProps) {
    return (
        <Component {...pageProps} />
    );
}
