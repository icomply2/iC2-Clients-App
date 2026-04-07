type ProductRexLogoProps = {
  className?: string;
};

export function ProductRexLogo({ className }: ProductRexLogoProps) {
  return (
    <svg
      viewBox="0 0 640 340"
      role="img"
      aria-label="ProductRex logo"
      className={className}
    >
      <path d="M132 73 229 95 320 22l82 73 99-22-10 22-90 17-81-66-84 66-94-17-10-22Z" fill="#4cbc82" />
      <path d="M148 107h33l38 93 32-76 28 54 40-104 38 104 30-55 32 77 38-93h33l-57 131c-47-32-99-50-145-50-44 0-94 18-140 49l-58-130Z" fill="#2f3134" />
      <path d="m181 124 42 14-22 72-20-86Zm73 17 37-48-17 99-20-51Zm65-49 37 48-20 53-17-101Zm62 3 40 47-20 50-20-97Zm71 28 39-14-20 82-19-68Z" fill="#d9d9dd" />
      <path d="M213 223c33-11 68-17 106-17 35 0 74 5 116 18-43-7-80-10-111-10-36 0-74 4-111 9Z" fill="#4cbc82" />
      <text x="8" y="328" fill="#2f3134" fontSize="116" fontFamily="Arial, Helvetica, sans-serif" fontWeight="300">
        Product
      </text>
      <text x="415" y="328" fill="#2f3134" fontSize="116" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700">
        Rex
      </text>
      <path d="m548 286 31 20 61-72-28 56h-32l-32-18Z" fill="#4cbc82" />
    </svg>
  );
}
