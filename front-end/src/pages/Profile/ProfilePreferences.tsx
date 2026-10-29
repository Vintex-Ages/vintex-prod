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
 *
 * Os dois pedidos da abertura falham separados (#287). Sem os estilos não há o
 * que desenhar: a tela fica no `ErrorState`. Sem as preferências, os estilos
 * aparecem desmarcados com um aviso — o `PUT` substitui o conjunto inteiro, e
 * salvar sem saber disso apagaria o que estava gravado.
 */
function ProfilePreferences() {
  const { toast } = useToast();
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [otherPreferences, setOtherPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [preferencesError, setPreferencesError] = useState(false);
  const [saving, setSaving] = useState(false);
  const latestLoad = useRef(0);
  const savingRef = useRef(false);

  const load = useCallback(() => {
    const loadId = ++latestLoad.current;
    setLoading(true);
    setLoadError(false);
    setPreferencesError(false);

    Promise.allSettled([getStyles(), getPreferences()]).then(
      ([stylesResult, preferencesResult]) => {
        if (loadId !== latestLoad.current) return;

        if (stylesResult.status === 'rejected') {
          setLoadError(true);
        } else {
          setStyles(stylesResult.value);
          if (preferencesResult.status === 'fulfilled') {
            const preferences = preferencesResult.value;
            setSelectedValues(
              preferences
                .filter((preference) => preference.type === 'estilo')
                .map((preference) => preference.value),
            );
            setOtherPreferences(preferences.filter((preference) => preference.type !== 'estilo'));
          } else {
            setSelectedValues([]);
            setOtherPreferences([]);
            setPreferencesError(true);
          }
        }
        setLoading(false);
      },
    );
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
      await savePreferences([...otherPreferences, ...preferences]);
      setPreferencesError(false);
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
          {preferencesError ? (
            <p role="status" className="border border-dourado bg-papel p-3 text-body-sm text-tinta">
              Não conseguimos carregar suas escolhas atuais. Salvar vai substituir o que estava
              gravado.
            </p>
          ) : null}

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
