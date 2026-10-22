import Link from "next/link";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Box 004 Santiago, inicio">
      <span className="brand-word">
        BOX <b>004</b>
        <small>SANTIAGO</small>
      </span>
    </Link>
  );
}
