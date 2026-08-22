// matchFilters.js - whether two waiting people are allowed to be paired.
// Pure: no sockets, no database, no timers. Every rule the spec argues about
// is decided here and nowhere else.
const NO_GENDER_FILTER = "";
const LOCATION_WORLDWIDE = "worldwide";
const LOCATION_COUNTRY = "country";

// The chip offers three states; two of them name a gender to filter on.
const FILTERABLE_GENDERS = ["man", "woman"];

// Attributes that mean "no answer given" and so match every filter. Unset is
// obvious. "prefer not to say" is here because someone picks that value
// specifically to not be sorted on — treating it as a hard non-match would
// silently hide them from everyone who set a filter.
//
// "non-binary" is deliberately NOT here: it is a real answer, not a missing
// one, so it matches "Anybody" and nothing else.
const WILDCARD_GENDERS = ["", "prefer not to say"];

/** Filters arrive over a socket, so nothing here trusts the shape it is given. */
function sanitizeFilters(input) {
  const f = input || {};
  return {
    gender: FILTERABLE_GENDERS.includes(f.gender) ? f.gender : NO_GENDER_FILTER,
    location: f.location === LOCATION_COUNTRY ? LOCATION_COUNTRY : LOCATION_WORLDWIDE,
  };
}

/**
 * Would the owner of `filter` accept being paired with `otherAttrs`?
 * `selfAttrs` is needed because "my country" is relative to whoever set it.
 */
function accepts(filter, selfAttrs, otherAttrs) {
  const f = filter || {};
  const self = selfAttrs || {};
  const other = otherAttrs || {};

  if (f.gender) {
    const theirs = other.gender || "";
    if (!WILDCARD_GENDERS.includes(theirs) && theirs !== f.gender) return false;
  }

  if (f.location === LOCATION_COUNTRY) {
    // Either side missing a country is a wildcard: with nothing to compare,
    // the filter has no opinion rather than a negative one.
    if (self.countryCode && other.countryCode && other.countryCode !== self.countryCode) {
      return false;
    }
  }

  return true;
}

/**
 * Gender filtering is one-way — picking "Women" does not require her to have
 * opted into men. Both sides are still consulted, because pairing A with B when
 * A's filter rejects B would violate A's filter.
 * @param {{filter: object, attrs: object}} a
 * @param {{filter: object, attrs: object}} b
 */
function canPairByFilters(a, b) {
  return (
    accepts(a.filter, a.attrs, b.attrs) && accepts(b.filter, b.attrs, a.attrs)
  );
}

module.exports = {
  sanitizeFilters,
  accepts,
  canPairByFilters,
  NO_GENDER_FILTER,
  LOCATION_WORLDWIDE,
  LOCATION_COUNTRY,
  FILTERABLE_GENDERS,
  WILDCARD_GENDERS,
};
