import React, { useState } from 'react';
import { MapPin, Globe, ExternalLink, Navigation, Search } from 'lucide-react';

interface GroundedPlace {
  title: string;
  uri: string;
  snippets: string[];
}

interface GroundedWebSource {
  title: string;
  uri: string;
}

export function CampusAreaView() {
  const [mapsQuery, setMapsQuery] = useState(
    '24-hour student clinics, pharmacies, and quiet study cafes near university campus'
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [geoStatus, setGeoStatus] = useState<string>('');
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsResult, setMapsResult] = useState<{
    text: string;
    places: GroundedPlace[];
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState(
    '2026 university student housing fire safety & hostel occupancy standards'
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{
    text: string;
    sources: GroundedWebSource[];
  } | null>(null);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocation is unavailable in this browser.');
      return;
    }
    setGeoStatus('Requesting coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGeoStatus(
          `Using coordinates ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
        );
      },
      () => {
        setGeoStatus('Location permission declined; searching without coordinates.');
      }
    );
  };

  const handleMapsSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapsQuery.trim()) return;
    setMapsLoading(true);
    setMapsError(null);
    try {
      const res = await fetch('/api/ai/grounding/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mapsQuery,
          latitude: coords?.lat,
          longitude: coords?.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Maps grounding failed.');
      setMapsResult(data);
    } catch (err: unknown) {
      setMapsError(
        err instanceof Error ? err.message : 'Unable to query Google Maps.'
      );
    } finally {
      setMapsLoading(false);
    }
  };

  const handleWebSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/ai/grounding/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search grounding failed.');
      setSearchResult(data);
    } catch (err: unknown) {
      setSearchError(
        err instanceof Error ? err.message : 'Unable to query Google Search.'
      );
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Google Maps Grounding Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-700" aria-hidden="true" />
                Campus Vicinity & Transit (Google Maps)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Verify nearby clinics, dining, and transit stops grounded in Google Maps via gemini-4-hydrogen.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLocateMe}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
            >
              <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
              Use Location
            </button>
          </div>

          {geoStatus && (
            <p className="text-xs font-mono text-slate-500">{geoStatus}</p>
          )}

          <form onSubmit={handleMapsSearch} className="flex gap-2">
            <input
              type="text"
              value={mapsQuery}
              onChange={(e) => setMapsQuery(e.target.value)}
              aria-label="Google Maps place query"
              placeholder="Find nearby clinics, laundromats, or bus stops..."
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={mapsLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {mapsLoading ? 'Searching...' : 'Find Places'}
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {[
              '24-hour pharmacies & student health clinics',
              'Campus bus & metro transit stations',
              'Grocery stores & late-night dining near campus',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMapsQuery(preset)}
                className="text-xs text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          {mapsError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {mapsError}
            </div>
          )}

          {mapsResult && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {mapsResult.text}
              </div>

              {mapsResult.places.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-900">
                    Verified Google Maps Locations
                  </h4>
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {mapsResult.places.map((place, idx) => (
                      <li key={`${place.uri}-${idx}`} className="p-3">
                        <a
                          href={place.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
                        >
                          {place.title}
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        </a>
                        {place.snippets.length > 0 && (
                          <p className="mt-1 text-xs text-slate-500">
                            {place.snippets[0]}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Google Search Grounding Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-700" aria-hidden="true" />
              Housing Policy & Live Web Research (Google Search)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Retrieve current campus housing regulations, safety compliance standards, and local advisories via gemini-4-hydrogen.
            </p>
          </div>

          <form onSubmit={handleWebSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Google Search query"
                placeholder="Search hostel regulations or campus guidelines..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {searchLoading ? 'Searching...' : 'Search Web'}
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {[
              'University residence hall fire safety & occupancy code',
              'Student dormitory roommate agreement & quiet hours policy',
              'Accessible campus housing ADA compliance standards',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setSearchQuery(preset)}
                className="text-xs text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          {searchError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {searchError}
            </div>
          )}

          {searchResult && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {searchResult.text}
              </div>

              {searchResult.sources.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-900">
                    Web Citations
                  </h4>
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {searchResult.sources.map((src, idx) => (
                      <li key={`${src.uri}-${idx}`} className="p-2.5">
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline break-all"
                        >
                          {src.title}
                          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
