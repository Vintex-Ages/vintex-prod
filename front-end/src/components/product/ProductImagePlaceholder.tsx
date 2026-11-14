type ProductImagePlaceholderProps = {
  productName: string;
};

function ProductImagePlaceholder({ productName }: ProductImagePlaceholderProps): JSX.Element {
  return (
    <div
      role="img"
      aria-label={productName}
      className="flex h-full w-full items-center justify-center text-texto-auxiliar"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-10 w-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16.5 8.5 12l3 3L16 10.5 20 15M4 6h16v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6Z"
        />
      </svg>
    </div>
  );
}

export default ProductImagePlaceholder;
