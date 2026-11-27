import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "relative isolate inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap outline-none select-none before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:transition-colors before:duration-400 before:ease-fade hover:before:bg-muted active:before:bg-accent focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        tonal: 'bg-accent text-foreground',
        solid: 'bg-solid text-solid-foreground',
        ghost: 'text-foreground',
        quiet: 'text-muted-foreground hover:text-foreground',
        destructive: 'bg-destructive text-white',
        link: 'rounded-none text-muted-foreground underline-offset-4 before:hidden hover:text-foreground hover:underline',
      },
      size: {
        default: 'h-9 gap-1.5 px-4 text-title',
        sm: 'h-8 gap-1.5 px-3 text-body',
        xs: 'h-6 gap-1 px-2.5 text-fineprint',
        lg: 'h-11 gap-2.5 px-[18px] text-head3',
        icon: 'size-11 rounded-md [&_svg:not([class*=size-])]:size-5',
        'icon-sm': 'size-9 rounded-md [&_svg:not([class*=size-])]:size-5',
        'icon-xs': 'size-7 rounded-sm [&_svg:not([class*=size-])]:size-3.5',
        'icon-round': 'size-11 [&_svg:not([class*=size-])]:size-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = ({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) => {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
};

export { Button, buttonVariants };
