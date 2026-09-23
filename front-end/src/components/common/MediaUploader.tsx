import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import Button from '@/components/common/Button';

export type MediaItem = {
  id: string;
  file?: File;
  url: string;
  type: 'image' | 'video';
  position: number;
};

export type MediaUploaderProps = {
  id: string;
  label: string;
  value: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  accept?: string;
  max?: number;
  single?: boolean;
  helperText?: string;
  error?: string;
  disabled?: boolean;
};

const DEFAULT_ACCEPT = 'image/*,video/*';

function matchesAccept(file: File, accept: string): boolean {
  const acceptedTypes = accept
    .split(',')
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean);

  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.startsWith('.')) {
      return file.name.toLowerCase().endsWith(acceptedType);
    }

    if (acceptedType.endsWith('/*')) {
      return file.type.toLowerCase().startsWith(acceptedType.slice(0, -1));
    }

    return file.type.toLowerCase() === acceptedType;
  });
}

function getMediaType(file: File): MediaItem['type'] | null {
  if (file.type.startsWith('image/')) {
    return 'image';
  }

  if (file.type.startsWith('video/')) {
    return 'video';
  }

  return null;
}

function normalizePositions(items: MediaItem[]): MediaItem[] {
  return items.map((item, index) => ({
    ...item,
    position: index,
  }));
}

/**
 * Seletor de mídia do Vintex para pré-visualização e organização de arquivos.
 *
 * Aceita arquivos por clique ou arrastar/soltar, permite reordenar e remover
 * itens e oferece a variante `single` para seleção de uma única mídia.
 * É apenas apresentacional: não realiza upload nem aplica regras de negócio
 * específicas das telas que utilizam o componente.
 *
 * Usage:
 *   import MediaUploader from '@/components/common/MediaUploader';
 *
 *   <MediaUploader
 *     id="fotos"
 *     label="Fotos da peça"
 *     value={media}
 *     onChange={setMedia}
 *   />
 *
 *   <MediaUploader
 *     id="logo"
 *     label="Logo da loja"
 *     value={logo}
 *     onChange={setLogo}
 *     single
 *   />
 */
function MediaUploader({
  id,
  label,
  value,
  onChange,
  accept = DEFAULT_ACCEPT,
  max = 8,
  single = false,
  helperText,
  error,
  disabled = false,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const orderedItems = [...value].sort((a, b) => a.position - b.position);

  function openFilePicker() {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  function addFiles(files: File[]) {
    if (disabled) {
      return;
    }

    const validFiles = files.filter(
      (file) => matchesAccept(file, accept) && getMediaType(file) !== null,
    );

    if (validFiles.length === 0) {
      return;
    }

    const newItems: MediaItem[] = validFiles.map((file, index) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      type: getMediaType(file) as MediaItem['type'],
      position: index,
    }));

    if (single) {
      onChange(normalizePositions([newItems[0]]));
      return;
    }

    const availableSlots = Math.max(0, max - orderedItems.length);

    if (availableSlots === 0) {
      return;
    }

    onChange(normalizePositions([...orderedItems, ...newItems.slice(0, availableSlots)]));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!disabled) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    addFiles(Array.from(event.dataTransfer.files));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  }

  function moveItem(index: number, direction: -1 | 1) {
    if (disabled) {
      return;
    }

    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= orderedItems.length) {
      return;
    }

    const updatedItems = [...orderedItems];

    [updatedItems[index], updatedItems[targetIndex]] = [
      updatedItems[targetIndex],
      updatedItems[index],
    ];

    onChange(normalizePositions(updatedItems));
  }

  function removeItem(index: number) {
    if (disabled) {
      return;
    }

    const updatedItems = orderedItems.filter((_, itemIndex) => itemIndex !== index);

    onChange(normalizePositions(updatedItems));
  }

  const reachedLimit = !single && orderedItems.length >= max;

  const describedBy = [helperText ? `${id}-helper` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="w-full">
      <label htmlFor={`${id}-input`} className="mb-2 block text-body font-semibold text-tinta">
        {label}
      </label>

      <input
        ref={inputRef}
        id={`${id}-input`}
        type="file"
        accept={accept}
        multiple={!single}
        disabled={disabled || reachedLimit}
        onChange={handleInputChange}
        aria-describedby={describedBy || undefined}
        className="sr-only"
      />

      <div
        role="button"
        tabIndex={disabled || reachedLimit ? -1 : 0}
        aria-disabled={disabled || reachedLimit}
        aria-describedby={describedBy || undefined}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={clsx(
          'flex min-h-32 w-full flex-col items-center justify-center gap-3 border-2 border-dashed bg-papel-profundo p-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta',
          isDragging ? 'border-vermelho-escuro' : 'border-linha',
          disabled || reachedLimit
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer hover:border-vermelho-escuro',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-8 w-8 text-texto-auxiliar"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5V18a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-1.5M12 3v12m0-12 4 4m-4-4L8 7"
          />
        </svg>

        <div>
          <p className="text-body font-semibold text-tinta">
            {reachedLimit ? 'Limite de arquivos atingido' : 'Arraste arquivos para cá'}
          </p>

          {!reachedLimit && (
            <p className="mt-1 text-body-sm text-texto-auxiliar">ou selecione pelo botão abaixo</p>
          )}
        </div>

        {!reachedLimit && (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              openFilePicker();
            }}
          >
            Selecionar mídia
          </Button>
        )}
      </div>

      {helperText && !error && (
        <p id={`${id}-helper`} className="mt-2 text-body-sm text-texto-auxiliar">
          {helperText}
        </p>
      )}

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-body-sm text-vermelho-escuro">
          {error}
        </p>
      )}

      {orderedItems.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-4 tablet:grid-cols-4">
          {orderedItems.map((item, index) => (
            <li key={item.id} className="min-w-0">
              <div className="relative aspect-square overflow-hidden border border-linha bg-papel-profundo">
                {item.type === 'image' ? (
                  <img
                    src={item.url}
                    alt={`Pré-visualização ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={item.url}
                    aria-label={`Pré-visualização do vídeo ${index + 1}`}
                    className="h-full w-full object-cover"
                    muted
                  />
                )}

                {index === 0 && (
                  <span className="absolute left-2 top-2 bg-tinta px-2 py-1 text-label font-semibold text-papel">
                    Capa
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  aria-label={`Mover mídia ${index + 1} para a esquerda`}
                  disabled={disabled || index === 0}
                  onClick={() => moveItem(index, -1)}
                  className="flex min-h-11 min-w-11 items-center justify-center border-2 border-linha bg-branco-quente text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span aria-hidden="true">←</span>
                </button>

                <button
                  type="button"
                  aria-label={`Mover mídia ${index + 1} para a direita`}
                  disabled={disabled || index === orderedItems.length - 1}
                  onClick={() => moveItem(index, 1)}
                  className="flex min-h-11 min-w-11 items-center justify-center border-2 border-linha bg-branco-quente text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span aria-hidden="true">→</span>
                </button>

                <button
                  type="button"
                  aria-label={`Remover mídia ${index + 1}`}
                  disabled={disabled}
                  onClick={() => removeItem(index)}
                  className="flex min-h-11 min-w-11 items-center justify-center border border-vermelho-escuro bg-transparent text-vermelho-escuro transition-colors hover:bg-vermelho-suave focus:outline-none focus-visible:ring-2 focus-visible:ring-vermelho-escuro disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 7h12m-10 0 .75 12h6.5L16 7M9 7V4h6v3"
                    />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MediaUploader;
