import { Container, Typography } from "@mui/material";
import styles from "./Footer.module.css";
import Link from "next/link";

const Footer = () => {
    return (
        <footer className={styles.footer}>
            <Container maxWidth="lg">
                <Typography variant="small" align="center" >
                    Powered by <Link href="https://github.com/hwchase17/langchain" target="_blank" rel="noreferrer"> LangChain</Link>.
                </Typography>
            </Container>
        </footer>
    );
}

export default Footer;