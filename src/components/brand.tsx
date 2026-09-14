export function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand ${light ? "brand-light" : ""}`}><BrandMark /><span>sabor<span className="brand-express">express<span className="brand-period">.</span></span></span></div>;
}

export function BrandMark() {
  return <span className="brand-mark"><svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 18h22c-1 7-5 10-11 10S7 25 6 18Z" fill="currentColor" /><path d="M3 13h17M7 8h15M22 13h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>;
}
