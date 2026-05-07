'use client';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width, height, className = '', style }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: width || '100%',
        height: height || '14px',
        ...style,
      }}
    />
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-stat-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ marginBottom: 0 }}>
          <Skeleton height="11px" width="60%" style={{ marginBottom: 12 }} />
          <Skeleton height="28px" width="80%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-card" style={{ padding: '16px 20px' }}>
      <div className="skeleton-row" style={{ marginBottom: 16 }}>
        <Skeleton height="11px" width="20%" />
        <Skeleton height="11px" width="30%" />
        <Skeleton height="11px" width="20%" />
        <Skeleton height="11px" width="20%" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton height="14px" width="20%" />
          <Skeleton height="14px" width="30%" />
          <Skeleton height="14px" width="20%" />
          <Skeleton height="14px" width="20%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <Skeleton height="20px" width="40%" style={{ marginBottom: 16 }} />
      <Skeleton height="14px" width="100%" style={{ marginBottom: 8 }} />
      <Skeleton height="14px" width="90%" style={{ marginBottom: 8 }} />
      <Skeleton height="14px" width="60%" />
    </div>
  );
}
