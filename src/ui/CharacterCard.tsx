import { getCharacterDef } from '../engine/cards/deck'
import { artUrl } from './artHashes'

const BASE = import.meta.env.BASE_URL

/** Small square portrait, used in sheets, the battle bar and the hand strip. */
export function CharacterPortrait({ defId, size }: { defId: string; size?: number }) {
  const def = getCharacterDef(defId)
  return (
    <span className="portrait" style={{ '--accent': def.color, width: size, height: size } as React.CSSProperties}>
      {def.art
        ? <img src={artUrl(def.art)} alt={def.name} loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }} />
        : <span className="portrait-fallback">{def.name.slice(0, 1)}</span>}
    </span>
  )
}
