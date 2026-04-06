import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface Step {
  label: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
}

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, i) => {
        const isCompleted = i < currentStep
        const isActive = i === currentStep
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                  isCompleted && 'border-green-600 bg-green-600 text-white',
                  isActive && 'border-green-600 bg-white text-green-600',
                  !isCompleted && !isActive && 'border-gray-300 bg-white text-gray-400',
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  isActive ? 'text-green-700' : isCompleted ? 'text-green-600' : 'text-gray-400',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'mx-2 mt-[-1.25rem] h-0.5 w-12',
                  i < currentStep ? 'bg-green-600' : 'bg-gray-300',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
