import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const Modal = ({ children, onClose, title = 'Form', maxWidthClass = 'max-w-4xl' }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`ui-surface rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto ${maxWidthClass}`}>
        <div className="sticky top-0 ui-surface border-b px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="ui-muted ui-hover-fg">
            <X size={24} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
