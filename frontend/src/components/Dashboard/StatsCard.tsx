import "./StatsCard.css";

interface StatsCardProps {
  title: string;
  value: string;
  variant?: "default" | "success" | "warning" | "danger";
}

export default function StatsCard({ title, value, variant = "default" }: StatsCardProps) {
  return (
    <div className={`stats-card stats-card--${variant}`}>
      <h3 className="stats-card-title">{title}</h3>
      <p className="stats-card-value">{value}</p>
    </div>
  );
}
