import { GST_STATE_BY_CODE } from '../../utils/gst';

/*
 * The spans are written out rather than interpolated: Tailwind scans the source
 * for whole class names, so `sm:col-span-${n}` is a class that never gets
 * generated and a field that silently loses its column.
 */
const DETAIL_SPAN = {
  4: 'col-span-12 sm:col-span-4',
  8: 'col-span-12 sm:col-span-8',
  12: 'col-span-12',
};

const CompanyDetailField = ({ label, value, mono = false, span = 4 }) => (
  <div className={DETAIL_SPAN[span] || DETAIL_SPAN[4]}>
    <div className="ui-detail-label">{label}</div>
    <div className={mono ? 'ui-detail-value ui-detail-mono' : 'ui-detail-value'}>
      {String(value || '').trim() || '\u2014'}
    </div>
  </div>
);

/**
 * The company as a record rather than as a form: the same read-then-edit shape
 * Branch Details and Warehouse Details already use, so the three screens under
 * Organisation stop describing the same kind of thing three different ways.
 *
 * Every field the form can set appears here, including the empty ones. A blank
 * row saying "—" is the answer to "did I fill this in?"; leaving it out turns a
 * missing value into an invisible one.
 */
export const CompanyProfileDetails = ({ form, company }) => {
  /*
   * `regStateCode` stores the GST state code — "29", not "Karnataka". The form
   * hides that behind a <select> showing names, so a read view printing the
   * stored value put a bare number where the user had chosen a state.
   */
  const stateName = GST_STATE_BY_CODE?.[String(form.regStateCode || '').trim()] || '';
  const address = [form.regAddress1, form.regAddress2, form.regCity, stateName, form.regPincode, form.regCountry]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6 max-w-4xl" aria-label="Company details">
      <div className="border rounded-xl p-5 shadow-sm ui-surface space-y-4">
        <div className="text-sm font-semibold ui-fg">Basic details</div>
        <div className="grid grid-cols-12 gap-4 text-sm">
          <CompanyDetailField label="Legal Company Name" value={form.legalName} span={8} />
          <CompanyDetailField label="Display / Trade Name" value={form.tradeName} />
          <CompanyDetailField label="Business Type" value={form.entityType} />
          <CompanyDetailField label="Industry" value={(form.industries || []).join(', ')} />
          <CompanyDetailField label="GSTIN" value={company?.gstin} mono />
          <CompanyDetailField label="Incorporation Date" value={form.incorporationDate} />
          <CompanyDetailField label="Financial Year Start" value={form.financialYearStart} />
          <CompanyDetailField label="Books Begin Date" value={form.booksBeginDate} />
          <CompanyDetailField label="Base Currency" value={form.baseCurrency} />
          <CompanyDetailField label="Country" value={form.country} />
          <CompanyDetailField label="Time Zone" value={form.timeZone} />
        </div>
      </div>

      <div className="border rounded-xl p-5 shadow-sm ui-surface space-y-4">
        <div className="text-sm font-semibold ui-fg">Contact</div>
        <div className="grid grid-cols-12 gap-4 text-sm">
          <CompanyDetailField label="Official Email" value={form.officialEmail} />
          <CompanyDetailField label="Phone Number" value={form.phone} mono />
          <CompanyDetailField label="Website" value={form.website} />
        </div>
      </div>

      <div className="border rounded-xl p-5 shadow-sm ui-surface space-y-4">
        <div className="text-sm font-semibold ui-fg">Registered address</div>
        <div className="grid grid-cols-12 gap-4 text-sm">
          <CompanyDetailField label="Address" value={address} span={12} />
          <CompanyDetailField label="State / UT" value={stateName} />
          <CompanyDetailField label="Pincode" value={form.regPincode} mono />
          <CompanyDetailField label="Country" value={form.regCountry} />
        </div>
      </div>
    </div>
  );
};

export default CompanyProfileDetails;
