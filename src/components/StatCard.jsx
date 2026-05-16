export default function StatCard({ label, value, unit = '', sub, color = 'text-gray-900', bg = 'bg-white', onClick }) {
  return (
    <button
      onClick={onClick}
      className={`${bg} rounded-2xl p-4 shadow-sm text-left w-full active:scale-[0.97] transition-transform`}
    >
      <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
      <div className="flex items-end gap-1">
        <span className={`text-3xl font-bold leading-none ${color}`}>{value}</span>
        {unit && <span className="text-sm text-gray-500 mb-0.5">{unit}</span>}
      </div>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </button>
  );
}
