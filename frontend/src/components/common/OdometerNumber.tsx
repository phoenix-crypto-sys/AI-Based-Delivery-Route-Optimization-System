import React, { useEffect, useState, useRef } from 'react';

interface OdometerNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const OdometerNumber: React.FC<OdometerNumberProps> = ({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isChanging, setIsChanging] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current === value) return;

    setIsChanging(true);
    const startVal = prevValueRef.current;
    const endVal = value;
    const startTime = performance.now();
    const duration = 350; // ms

    let animId: number;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        setDisplayValue(endVal);
        prevValueRef.current = endVal;
        setIsChanging(false);
      }
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [value]);

  const formatted = displayValue.toFixed(decimals);

  return (
    <span
      className={`font-telemetry inline-block transition-colors duration-200 ${
        isChanging ? 'text-blue-400' : ''
      } ${className}`}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};
