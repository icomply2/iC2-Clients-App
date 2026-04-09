type Hub24LogoProps = {
  className?: string;
};

export function Hub24Logo({ className }: Hub24LogoProps) {
  return (
    <svg
      viewBox="0 0 1157 311"
      role="img"
      aria-label="HUB24 logo"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1157" height="311" fill="#ffffff" />
      <defs>
        <linearGradient id="hub24Blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1b9bdb" />
          <stop offset="100%" stopColor="#3569b1" />
        </linearGradient>
        <linearGradient id="hub24Gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd95d" />
          <stop offset="100%" stopColor="#f5b829" />
        </linearGradient>
      </defs>

      <path d="M0 1h90v119h216V1h90v306h-90V200H90v107H0V1Z" fill="url(#hub24Blue)" />
      <path
        d="M471 1h89v186c0 19 3 34 10 44 7 11 17 18 31 23 13 4 29 7 47 7 18 0 34-3 47-7 13-5 23-12 30-23 7-10 11-25 11-44V1h89v186c0 41-13 72-39 94-26 22-71 33-138 33-65 0-111-11-137-33-27-22-40-53-40-94V1Z"
        fill="url(#hub24Blue)"
      />
      <path
        d="M892 1h132c35 0 62 6 81 17 18 12 31 26 39 43 7 17 11 34 11 52 0 18-4 35-11 52-8 17-21 31-39 43-19 11-46 17-81 17h-43v82h-89V1Zm105 155c22 0 38-4 48-13 9-9 14-21 14-35 0-14-5-25-14-34-10-10-26-14-48-14h-16v96h16Z"
        fill="url(#hub24Blue)"
      />
      <path
        d="M990 0h79c22 0 41 4 56 11 16 8 28 18 37 31 9 14 13 30 13 48 0 18-4 34-13 48-9 14-21 24-37 31-15 8-34 12-56 12h-18v126h-61V0Zm65 126c15 0 26-3 33-9 7-6 11-15 11-25 0-10-4-18-11-25-7-6-18-9-33-9h-4v68h4Z"
        fill="url(#hub24Blue)"
        opacity="0.001"
      />
      <path d="M941 13h83l-8 27h-44l-7 35h41l-6 26h-41l-12 56h-30l24-144Z" fill="none" />
      <text
        x="908"
        y="139"
        fill="url(#hub24Gold)"
        fontSize="178"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
      >
        24
      </text>
    </svg>
  );
}
