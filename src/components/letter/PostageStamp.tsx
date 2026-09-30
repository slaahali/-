import { useId } from "react";
import { Icon3D } from "@/components/ui/Icon3D";
import type { IconName } from "@/lib/assets";
import styles from "./letter.module.css";

/**
 * Perforated postage stamp with the card colour's 3D icon, cancelled by a round
 * postmark («يوم المعلم · ٥ أكتوبر» around the ring). Decorative.
 */
export function PostageStamp({
  icon,
  year,
  className = "",
}: {
  icon: IconName;
  /** Posting year in Arabic-Indic digits, printed in the postmark's centre. */
  year: string;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`${styles.postage} ${className}`}>
      <span className={styles.postageFace}>
        <span className={styles.postagePaper}>
          <span className={styles.postageField}>
            <Icon3D name={icon} size={96} priority className={styles.postageIcon} />
          </span>
        </span>
      </span>
      <Postmark year={year} />
    </span>
  );
}

function Postmark({ year }: { year: string }) {
  const id = useId().replace(/:/g, "");
  // Both arcs run left → right, so the Arabic reads right-to-left and upright:
  // over the top for the occasion, under the bottom for the date.
  return (
    <svg viewBox="0 0 150 100" className={styles.postmark} focusable="false">
      <defs>
        <path id={`${id}t`} d="M15 50a35 35 0 0 1 70 0" />
        <path id={`${id}b`} d="M9 50a41 41 0 0 0 82 0" />
      </defs>
      <g fill="none" stroke="currentColor">
        <circle cx="50" cy="50" r="46" strokeWidth="2.2" />
        <circle cx="50" cy="50" r="28" strokeWidth="1.4" />
        {/* cancellation waves trailing off across the stamp */}
        {[31, 42, 53, 64].map((y) => (
          <path
            key={y}
            d={`M95 ${y}c5-3.6 9-3.6 13 0s8 3.6 13 0 9-3.6 13 0 7 3 11 .8`}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ))}
      </g>
      <g fill="currentColor" className={styles.postmarkText}>
        <text>
          <textPath href={`#${id}t`} startOffset="50%" textAnchor="middle">
            يوم المعلم
          </textPath>
        </text>
        <text>
          <textPath href={`#${id}b`} startOffset="50%" textAnchor="middle">
            ٥ أكتوبر
          </textPath>
        </text>
        <circle cx="10.5" cy="50" r="1.8" />
        <circle cx="89.5" cy="50" r="1.8" />
        <text x="50" y="56" textAnchor="middle" className={styles.postmarkYear}>
          {year}
        </text>
      </g>
    </svg>
  );
}
