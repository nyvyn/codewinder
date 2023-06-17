import styles from "./Header.module.css";
import Link from "next/link";

const Header = () => {
    return (
        <div className={styles.topnav}>
            <div className={styles.navlogo}>
                <Link href="/">Codewinder</Link>
            </div>
            <div className={styles.navlinks}>
                <Link
                    href="https://github.com/nyvyn/codewinder"
                    target="_blank"
                    rel="noreferrer"
                >
                    GitHub
                </Link>
            </div>
        </div>
    );
}

export default Header;