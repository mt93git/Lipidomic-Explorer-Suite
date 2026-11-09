import { stages } from "@/lib/models";

export function OrderStepper({ stage, released }: { stage: number; released: boolean }) {
  return <div className="stepper-scroll" role="region" aria-label="Order lifecycle" tabIndex={0}>
    <ol className="stepper" aria-label="Order progress">{stages.map((label, index) => {
      const complete = released || index < stage;
      const current = !released && index === stage;
      return <li className={`step ${complete ? "complete" : ""}`} key={label} aria-current={current ? "step" : undefined}>
        <span className="step-dot" aria-hidden="true">{complete ? "✓" : index + 1}</span>
        <span className="step-name">{label}</span><span className="step-status">{complete ? "Complete" : current ? "Current" : "Upcoming"}</span>
      </li>;
    })}</ol>
    {released && <p className="released-status">Released</p>}
  </div>;
}
