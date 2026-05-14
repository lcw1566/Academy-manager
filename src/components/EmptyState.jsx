export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="text-4xl mb-4">{icon}</div>}
      <p className="text-base font-semibold text-gray-700 mb-1">{title}</p>
      {description && <p className="text-sm text-gray-400 mb-5">{description}</p>}
      {action && action}
    </div>
  );
}
