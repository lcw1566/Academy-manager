import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { getAcademyTabHelp } from './academyTabHelp';

export default function AcademyTabHelpModal({ isOpen, onClose, tabId }) {
  const help = getAcademyTabHelp(tabId);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={help.title}
      fitContent
      desktopPlacement="bottom"
    >
      <p className="text-sm font-semibold leading-6 text-seenit-secondary">{help.summary}</p>
      {help.warning && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <p className="text-xs font-bold leading-5">{help.warning}</p>
        </div>
      )}
      <ul className="mt-4 space-y-3">
        {help.items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-seenit-secondary">
            <CheckCircle2 size={17} className="mt-1 shrink-0 text-seenit-brand" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
