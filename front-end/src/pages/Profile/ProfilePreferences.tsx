import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import StyleSelector from '@/components/preferences/StyleSelector';
import { useToast } from '@/context/useToast';
import { getPreferences, getStyles, savePreferences } from '@/services/preferenceService';
import type { Preference, StyleOption } from '@/types/preference';

/**
 * `/profile/preferences` — edição das preferências de estilo no perfil
 * (FE-US004-3, #72).
 */
function ProfilePreferences() {
  const { toast } = useToast();
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const latestLoad = useRef(0);
  const savingRef = useRef(false);

  const load = useCallback(() => {
    const loadId = ++latestLoad.current;
    setLoading(true);
    setLoadError(false);

    Promise.all([getStyles(), getPreferences()])
      .then(([availableStyles, preferences]) => {
        if (loadId !== latestLoad.current) return;

        setStyles(availableStyles);
        setSelectedValues(preferences.map((preference) => preference.value));
      })
      .catch(() => {
        if (loadId === latestLoad.current) setLoadError(true);
      })
      .finally(() => {
        if (loadId === latestLoad.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();

    return () => {
      latestLoad.current += 1;
    };
  }, [load]);

  async function handleSave() {
    if (savingRef.current) return;

    const preferences: Preference[] = selectedValues.flatMap((value) => {
      const style = styles.find((item) => item.value === value);
      return style ? [{ type: style.type, value }] : [];
    });

    savingRef.current = true;
    setSaving(true);

    try {
      await savePreferences(preferences);
      toast('Preferências salvas com sucesso.', { kind: 'success' });
    } catch {
      toast('Não foi possível salvar suas preferências. Tente novamente.', { kind: 'error' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-6 tablet:py-10">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-h2 text-tinta">Meus Estilos &amp; Preferências da IA</h1>
        <p className="max-w-prose text-body text-texto-auxiliar">
          Atualize os estilos usados na curadoria do seu feed e nas recomendações da assistente.
        </p>
      </div>

      {loading ? (
        <ul className="flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <li
              key={index}
              className="flex animate-pulse items-center gap-3 border border-linha bg-branco-quente p-3 motion-reduce:animate-none"
            >
              <span className="h-10 w-10 shrink-0 rounded-full bg-papel-profundo" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-4 w-32 bg-papel-profundo" />
                <span className="h-3 w-48 bg-papel-profundo" />
              </span>
            </li>
          ))}
        </ul>
      ) : loadError ? (
        <ErrorState message="Não foi possível carregar suas preferências agora." onRetry={load} />
      ) : (
        <>
          <StyleSelector
            styles={styles}
            selectedValues={selectedValues}
            onChange={setSelectedValues}
            disabled={saving}
          />

          <div className="flex justify-end">
            <Button fullWidth className="tablet:w-auto" disabled={saving} onClick={handleSave}>
              {saving ? 'Salvando…' : 'Salvar preferências'}
            </Button>
          </div>
        </>
      )}
    </Container>
  );
}

export default ProfilePreferences;
