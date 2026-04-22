export default function Reel({ reverse = false, size = 48 }) {
  return (
    <div
      className="animate-spin"
      style={{
        animationDuration: reverse ? '1.7s' : '2.1s',
        animationDirection: reverse ? 'reverse' : 'normal',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" stroke="#F2A24A" strokeWidth="2.5" fill="none" />
        <circle cx="24" cy="24" r="7" stroke="#F2A24A" strokeWidth="1.5" fill="none" />
        <circle cx="24" cy="24" r="2.5" fill="#F2A24A" />
        <line x1="24" y1="4" x2="24" y2="17" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
        <line x1="41.3" y1="34" x2="30.1" y2="27.5" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
        <line x1="6.7" y1="34" x2="17.9" y2="27.5" stroke="#F2A24A" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}
