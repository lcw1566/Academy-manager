import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { tossSpring } from '../utils/motion';

const variants = {
  primary: 'bg-[#0064FF] text-white active:bg-[#0050cc]',
  secondary: 'bg-[#F2F4F6] text-[#191F28] active:bg-[#E5E8EB]',
  ghost: 'bg-transparent text-[#0064FF] active:bg-blue-50',
  danger: 'bg-red-500 text-white active:bg-red-600',
};

const sizes = {
  sm: 'h-9 px-3 text-xs rounded-xl',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-12 px-5 text-sm rounded-2xl',
};

const TossButton = forwardRef(function TossButton(
  {
    as = motion.button,
    type = 'button',
    variant = 'primary',
    size = 'lg',
    loading = false,
    disabled = false,
    fullWidth = false,
    icon: Icon,
    children,
    className = '',
    ...props
  },
  ref,
) {
  const Component = as;
  const isDisabled = disabled || loading;

  return (
    <Component
      ref={ref}
      type={type}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.965, y: 1 }}
      transition={tossSpring.tap}
      className={[
        'inline-flex items-center justify-center gap-1.5 font-bold select-none',
        'disabled:opacity-45 disabled:pointer-events-none',
        'will-change-transform transform-gpu',
        fullWidth ? 'w-full' : '',
        variants[variant] || variants.primary,
        sizes[size] || sizes.lg,
        className,
      ].filter(Boolean).join(' ')}
      style={{
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        ...props.style,
      }}
      {...props}
    >
      {loading ? <Loader2 size={15} /> : Icon ? <Icon size={15} /> : null}
      {children}
    </Component>
  );
});

export default TossButton;
