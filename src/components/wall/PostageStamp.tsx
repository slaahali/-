import { useId } from "react";
import { Icon3D } from "@/components/ui/Icon3D";
import { cardStyle } from "@/lib/assets";
import type { PublicMessage } from "@/lib/types";
import { DoveGlyph } from "./glyphs";
import { postmarkDate } from "./wall-utils";
import styles from "./wall.module.css";

/**
 * Decorative postage stamp for a card's top-end corner: a perforated stamp with
 * the colour's 3D icon (a dove for «في ذكرى» letters) and a round postmark
 * carrying the date it was written. aria-hidden: the card states the date itself.
 */
export function PostageStamp({ message: m, className = "" }: { message: PublicMessage; className?: string }) {
  const s = cardStyle(m);
  const date = postmarkDate(m.createdAt);
  return (
    <span aria-hidden="true" className={`${styles.stamp} ${className}`}>
      <span className={styles.stampFace}>
        <span className={styles.stampPanel}>
          {m.inMemory ? (
            <DoveGlyph size={36} className={styles.dove} />
          ) : (
            <Icon3D name={s.icon} size={38} />
          )}
        </span>
      </span>
      {date && <Postmark day={date.day} month={date.month} />}
    </span>
  );
}

function Postmark({ day, month }: { day: string; month: string }) {
  const arc = useId();
  return (
    <svg viewBox="0 0 96 48" width="96" height="48" className={styles.postmark} focusable="false">
      {/* cancellation waves run from the ring across the stamp */}
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
        <path d="M12 15c3.5-3 7-3 10 0s7 3 10 0 7-3 10 0 5 2.4 8 1" />
        <path d="M12 24c3.5-3 7-3 10 0s7 3 10 0 7-3 10 0 5 2.4 8 1" />
        <path d="M12 33c3.5-3 7-3 10 0s7 3 10 0 7-3 10 0 5 2.4 8 1" />
      </g>
      <g transform="translate(72 24)" fill="currentColor">
        <circle r="21.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle r="14" fill="none" stroke="currentColor" strokeWidth="0.8" />
        <path id={arc} d="M-17.6 0a17.6 17.6 0 0 1 35.2 0" fill="none" />
        <text fontSize="5.6" fontWeight="700" textAnchor="middle" direction="rtl">
          <textPath href={`#${arc}`} startOffset="50%">
            يوم المعلم
          </textPath>
        </text>
        <text y="2.5" fontSize="10.5" fontWeight="700" textAnchor="middle">
          {day}
        </text>
        <text y="9.5" fontSize="5" fontWeight="700" textAnchor="middle">
          {month}
        </text>
      </g>
    </svg>
  );
}
