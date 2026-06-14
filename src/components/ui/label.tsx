"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

const Label = (
  {
    ref,
    className,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement> &
    VariantProps<typeof labelVariants> & {
      ref?: React.Ref<HTMLLabelElement>
    }
) => (<label
  ref={ref}
  className={cn(labelVariants(), className)}
  {...props}
/>)
Label.displayName = "Label"

export { Label }
