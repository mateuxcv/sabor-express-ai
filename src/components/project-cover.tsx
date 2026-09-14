import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { Brand } from "./brand";
import { CoverExperience } from "./cover/cover-experience";
import styles from "./cover/cover.module.css";

export function ProjectCover() {
  return <CoverExperience>
    <a className={styles.skipLink} href="#restaurant-dock">Pular para os controles do restaurante</a>
    <h1 className={styles.srOnly}>Sabor Express — um restaurante para entrar, explorar e interagir.</h1>
    <header className={styles.header}>
      <Link href="/" aria-label="Sabor Express início" className={styles.brand}><Brand /></Link>
      <span className={styles.location}>PINHEIROS, SÃO PAULO <span>23°33′ S / 46°41′ W</span></span>
      <details className={styles.projectMenu}>
        <summary>O projeto <Plus size={17} /></summary>
        <nav aria-label="Abrir experiências do projeto">
          <span>CONTINUE A EXPERIÊNCIA</span>
          {[['WhatsApp', '/whatsapp'], ['Dashboard', '/dashboard'], ['CRM', '/crm'], ['Apresentação', '/apresentacao']].map(([label, href], index) => <Link href={href} prefetch={false} key={href}><small>0{index + 1}</small>{label}<ArrowUpRight size={16} /></Link>)}
        </nav>
      </details>
    </header>
  </CoverExperience>;
}
