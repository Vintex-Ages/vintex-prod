import InputField from '@/components/common/InputField';
import Select, { type SelectOption } from '@/components/common/Select';
import type { CepStatus } from '@/hooks/useAddressLookup';
import type { StoreAddress } from '@/types/store';

export type AddressFieldsProps = {
  idPrefix: string;
  value: StoreAddress;
  onChange: (field: keyof StoreAddress, value: string) => void;
  errors?: Partial<Record<keyof StoreAddress, string>>;
  cepStatus: CepStatus;
  disabled?: boolean;
};

const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

const UF_OPTIONS: SelectOption[] = UFS.map((uf) => ({
  value: uf,
  label: uf,
}));

const CEP_HELPER: Partial<Record<CepStatus, string>> = {
  loading: 'Buscando endereço…',
  error: 'Não foi possível consultar o CEP agora. Preencha o endereço abaixo.',
};

/**
 * Bloco reutilizável de campos de endereço.
 *
 * A consulta e as regras de CEP ficam fora deste componente.
 *
 * Usage:
 * <AddressFields
 *   idPrefix="store"
 *   value={address}
 *   onChange={setAddressField}
 *   errors={errors}
 *   cepStatus={cepStatus}
 * />
 */
function AddressFields({
  idPrefix,
  value,
  onChange,
  errors = {},
  cepStatus,
  disabled = false,
}: AddressFieldsProps): JSX.Element {
  return (
    <>
      <InputField
        id={`${idPrefix}-cep`}
        label="CEP"
        placeholder="00000-000"
        value={value.cep}
        onChange={(nextValue) => onChange('cep', nextValue)}
        error={errors.cep}
        helperText={CEP_HELPER[cepStatus]}
        disabled={disabled}
      />

      <InputField
        id={`${idPrefix}-street`}
        label="Rua"
        value={value.street}
        onChange={(nextValue) => onChange('street', nextValue)}
        error={errors.street}
        disabled={disabled}
      />

      <div className="grid grid-cols-2 gap-4">
        <InputField
          id={`${idPrefix}-number`}
          label="Número"
          value={value.number}
          onChange={(nextValue) => onChange('number', nextValue)}
          error={errors.number}
          disabled={disabled}
        />

        <InputField
          id={`${idPrefix}-complement`}
          label="Complemento"
          placeholder="Opcional"
          value={value.complement ?? ''}
          onChange={(nextValue) => onChange('complement', nextValue)}
          error={errors.complement}
          disabled={disabled}
        />
      </div>

      <InputField
        id={`${idPrefix}-district`}
        label="Bairro"
        value={value.district}
        onChange={(nextValue) => onChange('district', nextValue)}
        error={errors.district}
        disabled={disabled}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <InputField
            id={`${idPrefix}-city`}
            label="Cidade"
            value={value.city}
            onChange={(nextValue) => onChange('city', nextValue)}
            error={errors.city}
            disabled={disabled}
          />
        </div>

        <Select
          id={`${idPrefix}-state`}
          label="UF"
          placeholder="—"
          options={UF_OPTIONS}
          value={value.state}
          onChange={(nextValue) => onChange('state', nextValue ?? '')}
          error={errors.state}
          disabled={disabled}
        />
      </div>
    </>
  );
}

export default AddressFields;