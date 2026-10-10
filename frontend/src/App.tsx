import { useEffect, useState, useRef, useMemo } from "react";
import {
  MapPin,
  Search,
  ArrowUpRight,
  Navigation,
  LocateFixed,
  Building2,
  GraduationCap,
  BedDouble,
  Utensils,
  HeartPulse,
  Landmark,
  ArrowLeft,
  ArrowRight,
  Compass,
  MessageCircle,
  UserRound,
  ShieldCheck,
  X,
  Check,
  Bookmark,
  Flag,
  SlidersHorizontal,
  Info,
  Menu,
  Send,
  LogOut,
  Plus,
  Route as RouteIcon,
  Megaphone,
} from "lucide-react";
import AdminTools from "./components/AdminTools";
import InstallApp from "./components/InstallApp";
import Conversations from "./components/Conversations";
import AnnouncementEditor from "./components/AnnouncementEditor";
import CampusMap from "./components/CampusMap";
import { api, post, type Place, type User } from "./services/api";
import campus from "./data/campus.json";
import LocationSuggestion from "./components/LocationSuggestion";
import { walkingDirectionsUrl } from "./services/directions";
import { useLiveLocation } from "./services/useLiveLocation";
import {
  distanceMeters,
  mapLabel,
  type LocationFix,
} from "./services/location";

const icons: Record<string, typeof Building2> = {
  Academic: GraduationCap,
  Hostel: BedDouble,
  Food: Utensils,
  Healthcare: HeartPulse,
  Administrative: Landmark,
};
const categoryIcon = (category: string) => icons[category] ?? Building2;
type View =
  | "explore"
  | "directions"
  | "assistant"
  | "conversations"
  | "announcements"
  | "profile"
  | "admin";
export default function App() {
  const [view, setView] = useState<View>(
    new URLSearchParams(location.search).has("reset")
      ? "profile"
      : new URLSearchParams(location.search).get("view") === "announcements"
        ? "announcements"
        : "explore",
  );
  const [historical, setHistorical] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [directoryScope, setDirectoryScope] = useState<"all" | "mapped">(
    "mapped",
  );
  const [mappedPlaces, setMappedPlaces] = useState<Place[]>(campus.mapped);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const categories = useMemo(
    () =>
      [
        ...new Set(
          [...campus.directory, ...mappedPlaces].map((p) => p.category),
        ),
      ]
        .sort()
        .map((name, id) => ({ name, id })),
    [mappedPlaces],
  );
  const [selected, setSelected] = useState<Place | null>(null);
  const loading = false;
  const error = "";
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const live = useLiveLocation();
  const position = useMemo<[number, number] | null>(
    () => (live.fix ? [live.fix.latitude, live.fix.longitude] : null),
    [live.fix],
  );
  const [follow, setFollow] = useState(false);
  const [suggestPlace, setSuggestPlace] = useState<Place | null>(null);
  const [draft, setDraft] = useState<{ place: Place; fix: LocationFix } | null>(
    null,
  );
  const draftPlace = useMemo(
    () =>
      draft
        ? {
            ...draft.place,
            latitude: draft.fix.latitude,
            longitude: draft.fix.longitude,
          }
        : null,
    [draft],
  );
  const [route, setRoute] = useState<[number, number][]>([]);
  const [mobileList, setMobileList] = useState(true);
  const [nearby, setNearby] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [nearbyOrigin, setNearbyOrigin] = useState<[number, number] | null>(
    null,
  );
  const [report, setReport] = useState<Place | null>(null);
  const [mapReset, setMapReset] = useState(0);
  const places = useMemo(() => {
    const origin = nearbyOrigin ?? position;
    let items: Place[] =
      directoryScope === "all" && !nearby ? campus.directory : mappedPlaces;
    const search = query
      .trim()
      .toLowerCase()
      .replace(/^(block|map|entry)\s+/, "");
    items = items.filter(
      (p) =>
        (!category || p.category === category) &&
        (!search ||
          p.name.toLowerCase().includes(search) ||
          p.category.toLowerCase().includes(search) ||
          mapLabel(p, mappedPlaces).toLowerCase() === search ||
          p.plan_code?.toLowerCase() === search ||
          String(p.old_map_id) === search),
    );
    if (nearby && origin) {
      const rad = Math.PI / 180;
      items = items
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => {
          const a =
            Math.sin(((p.latitude! - origin[0]) * rad) / 2) ** 2 +
            Math.cos(origin[0] * rad) *
              Math.cos(p.latitude! * rad) *
              Math.sin(((p.longitude! - origin[1]) * rad) / 2) ** 2;
          return {
            ...p,
            distance_m: 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a))),
          };
        })
        .sort((a, b) => a.distance_m - b.distance_m);
    }
    return items;
  }, [
    query,
    category,
    directoryScope,
    nearby,
    position,
    nearbyOrigin,
    mappedPlaces,
  ]);
  useEffect(() => {
    if (view === "directions") setMobileList(true);
    if (view !== "explore" && view !== "directions") {
      live.stop();
      setFollow(false);
    }
  }, [view]);
  useEffect(() => {
    api("/profile")
      .then(setUser)
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    api("/locations")
      .then((data) => {
        if (!Array.isArray(data.items))
          throw new Error("No mapped records available");
        if (active) {
          setMappedPlaces(data.items);
          setApiUnavailable(false);
        }
      })
      .catch(() => {
        if (active) setApiUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  const locate = () => {
    live.start();
    setFollow(true);
    setHistorical(false);
    setMobileList(false);
  };
  const choose = (p: Place) => {
    setHistorical(false);
    if (p.historical) {
      setFollow(false);
      if (p.latitude == null)
        setNotice(
          "This reference has no verified GPS position yet. Its number will appear on the live map after the position is verified.",
        );
    }
    setSelected(p);
    setMobileList(false);
    if (!p.historical && !p.snapshot)
      api<Place>("/locations/" + p.id)
        .then((detail) =>
          setSelected((previous) =>
            previous?.id === detail.id ? detail : previous,
          ),
        )
        .catch((e) => setNotice(e.message));
    if (user) post("/history", { query: p.name }).catch(() => {});
  };
  const switchView = (next: View) => {
    setView(next);
    setSelected(null);
  };
  return (
    <div className="app">
      <aside className="rail">
        <button
          className="brand-symbol"
          aria-label="Explore campus"
          onClick={() => switchView("explore")}
        >
          <Compass size={27} />
        </button>
        <div className="rail-nav">
          {(
            [
              ["explore", Compass, "Explore"],
              ["directions", Navigation, "Directions"],
              ["assistant", MessageCircle, "Assistant"],
              ["announcements", Megaphone, "Updates"],
              ["conversations", MessageCircle, "Chat"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              title={label}
              aria-label={label}
              className={view === key ? "active" : ""}
              onClick={() => switchView(key)}
            >
              <Icon size={22} />
              <small>{label}</small>
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          {user?.role === "ADMIN" && (
            <button
              title="Admin"
              aria-label="Admin"
              onClick={() => switchView("admin")}
            >
              <ShieldCheck />
            </button>
          )}
          <button
            aria-label="Profile"
            title="Profile"
            className={view === "profile" ? "active" : ""}
            onClick={() => switchView("profile")}
          >
            <UserRound size={21} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="wordmark">
            <span>
              LPU<span className="wordmark-dot">.</span>
            </span>
            <div>
              Campus Navigator<small>Lovely Professional University</small>
            </div>
          </div>
          <div className="topbar-right">
            <InstallApp />
            <span className="student-label">A student-developed project</span>
            <button
              className="text-button"
              onClick={() => switchView(user ? "profile" : "profile")}
            >
              {user ? "My account" : "Sign in"}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PHAGWARA, PUNJAB · CAMPUS EXPLORER</div>
              <h1>
                {view === "explore"
                  ? "A whole campus. One clear view."
                  : view === "directions"
                    ? "Your next step, simplified."
                    : view === "assistant"
                      ? "A little help finding your place."
                      : view === "admin"
                        ? "Keep the campus connected."
                        : view === "announcements"
                          ? "Around campus."
                          : "Your campus companion."}
              </h1>
              <p>
                {view === "explore"
                  ? "Find a block, discover a place, and make yourself at home."
                  : "Useful campus information, with its sources kept in view."}
              </p>
            </div>
            <button
              className="outline-button"
              onClick={() => {
                switchView("directions");
              }}
            >
              <Navigation size={16} />
              Get directions
              <ArrowUpRight size={15} />
            </button>
          </div>
          {["explore", "directions"].includes(view) ? (
            <div className="explorer">
              <section
                className={`directory ${mobileList ? "mobile-open" : ""}`}
                aria-label="Campus directory"
              >
                {view === "directions" ? (
                  <Directions
                    places={mappedPlaces.filter((p) => !p.snapshot)}
                    selected={selected}
                    onRoute={(points) => {
                      setRoute(points);
                      setFollow(false);
                      if (points.length) {
                        setHistorical(false);
                        setMobileList(false);
                      }
                    }}
                    onHistorical={() => {
                      setHistorical(false);
                      setNearby(false);
                    }}
                  />
                ) : (
                  <>
                    <div className="directory-head">
                      <div>
                        <span className="eyebrow">FIND YOUR DESTINATION</span>
                        <h2>Campus directory</h2>
                      </div>
                      <span className="count">
                        {directoryScope === "all" ? 55 : mappedPlaces.length}
                      </span>
                    </div>
                    <div className="directory-tabs" aria-label="Directory view">
                      <button
                        aria-pressed={directoryScope === "all" && !nearby}
                        className={
                          directoryScope === "all" && !nearby ? "selected" : ""
                        }
                        onClick={() => {
                          setDirectoryScope("all");
                          setNearby(false);
                          setQuery("");
                          setCategory("");
                          setSelected(null);
                        }}
                      >
                        Historical entries <span>55</span>
                      </button>
                      <button
                        aria-pressed={directoryScope === "mapped" || nearby}
                        className={
                          directoryScope === "mapped" || nearby
                            ? "selected"
                            : ""
                        }
                        onClick={() => {
                          setDirectoryScope("mapped");
                          setNearby(false);
                          setQuery("");
                          setCategory("");
                          setSelected(null);
                        }}
                      >
                        On the map <span>{mappedPlaces.length}</span>
                      </button>
                    </div>
                    <label className="search-box">
                      <Search size={19} />
                      <input
                        aria-label="Search campus"
                        placeholder="Search a name or number, e.g. 55"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setNearby(false);
                        }}
                      />
                      <span className="search-key">⌕</span>
                    </label>
                    <div className="category-label">
                      <span>FIND YOUR PLACE</span>
                      <SlidersHorizontal size={14} />
                    </div>
                    <div className="category-grid">
                      {[
                        ["", "All places"],
                        ["Academic", "Academic"],
                        ["Hostel", "Hostels"],
                        ["Food", "Food & drink"],
                        ["Healthcare", "Healthcare"],
                        ["Administrative", "Services"],
                      ].map(([value, label]) => {
                        const Icon = categoryIcon(value);
                        return (
                          <button
                            key={label}
                            className={category === value ? "chosen" : ""}
                            onClick={() => setCategory(value)}
                          >
                            <Icon size={17} />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <label className="sr-only" htmlFor="more-categories">
                      All categories
                    </label>
                    <select
                      id="more-categories"
                      className="category-select"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">All categories</option>
                      {categories.map((c) => (
                        <option key={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="results-heading">
                      <h3>
                        {nearby
                          ? "Nearest mapped places"
                          : directoryScope === "all"
                            ? "Numbered campus entries"
                            : "Geographically mapped places"}
                      </h3>
                      <span>
                        {loading ? "Loading…" : `${places.length} places`}
                      </span>
                    </div>
                    <div className="result-list" aria-live="polite">
                      {error ? (
                        <div className="empty">
                          <p>{error}</p>
                          <button onClick={() => setRefresh((n) => n + 1)}>
                            Try again
                          </button>
                        </div>
                      ) : loading ? (
                        <div className="skeletons">
                          {[1, 2, 3, 4].map((n) => (
                            <div key={n} />
                          ))}
                        </div>
                      ) : places.length === 0 ? (
                        <div className="empty">
                          <MapPin />
                          <h3>No matching places</h3>
                          <p>Try another name, entry number, or category.</p>
                          <button
                            className="outline-button"
                            onClick={() => {
                              setQuery("");
                              setCategory("");
                              setNearby(false);
                            }}
                          >
                            Clear filters
                          </button>
                        </div>
                      ) : (
                        places.map((p) => {
                          return (
                            <button
                              key={p.id}
                              className={`place-row ${selected?.id === p.id ? "selected" : ""}`}
                              onClick={() => choose(p)}
                            >
                              <div className="place-icon">
                                {p.old_map_id ? (
                                  <span className="entry-number">
                                    {String(p.old_map_id).padStart(2, "0")}
                                  </span>
                                ) : (
                                  <span className="entry-number">
                                    {mapLabel(p, mappedPlaces)}
                                  </span>
                                )}
                              </div>
                              <div className="place-copy">
                                <strong>{p.name}</strong>
                                <span>
                                  {p.category}
                                  {p.old_map_id
                                    ? ` · Map ${String(p.old_map_id).padStart(2, "0")}`
                                    : ""}
                                </span>
                                <small>
                                  <i />
                                  {p.historical
                                    ? p.category === "Unidentified"
                                      ? "Name missing from source"
                                      : "Campus plan reference"
                                    : p.number_basis === "campus_plan"
                                      ? "Campus plan · approximate"
                                      : p.verification_status
                                          .replaceAll("_", " ")
                                          .toLowerCase()}
                                  {p.distance_m != null
                                    ? ` · ${Math.round(p.distance_m)} m straight-line`
                                    : ""}
                                </small>
                              </div>
                              <ArrowUpRight className="row-arrow" size={16} />
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="directory-footer">
                      <Info size={17} />
                      <span>
                        {directoryScope === "all"
                          ? "55 reference entries. Only buildings with sourced GPS positions and numbers can be numbered on the live map."
                          : "Live GPS map · numbers come from geographic source records. Unnumbered places retain their names."}
                      </span>
                    </div>
                  </>
                )}
              </section>
              <section className="map-area" aria-label="Interactive campus map">
                <div className="map-toolbar">
                  <div className="mode-toggle">
                    <button
                      className={!historical ? "selected" : ""}
                      onClick={() => {
                        setHistorical(false);
                        setSelected(null);
                        setFollow(false);
                        setMapReset((n) => n + 1);
                      }}
                    >
                      <MapPin size={14} /> Live GPS map
                    </button>
                  </div>
                  <button
                    className="map-locate"
                    aria-label="Start live location and follow me"
                    title="Start live location and follow me"
                    onClick={locate}
                  >
                    <LocateFixed size={19} />
                  </button>
                </div>
                <CampusMap
                  key={mapReset}
                  historical={historical}
                  places={mappedPlaces}
                  selected={selected}
                  onSelect={choose}
                  position={position}
                  route={route}
                  accuracy={live.fix?.accuracy}
                  fresh={live.fresh}
                  follow={follow}
                  pauseFollow={() => setFollow(false)}
                  suggestion={draftPlace}
                />
                <div
                  className="gps-panel"
                  hidden={
                    historical || (view === "directions" && !live.enabled)
                  }
                >
                  {live.enabled ? (
                    <>
                      <strong>
                        {live.fresh
                          ? follow
                            ? "Following your location"
                            : "Live location · free browsing"
                          : "Waiting for a fresh GPS fix…"}
                      </strong>
                      <span>
                        {live.fix
                          ? `Accuracy ±${Math.round(live.fix.accuracy)} m`
                          : "Allow location in your browser when asked."}{" "}
                        · Stays on this device
                      </span>
                      {live.fresh &&
                        position &&
                        selected?.latitude != null &&
                        selected.longitude != null && (
                          <b>
                            {Math.round(
                              distanceMeters(position, [
                                selected.latitude,
                                selected.longitude,
                              ]),
                            )}{" "}
                            m straight-line to {selected.name}
                          </b>
                        )}
                      <div>
                        <button
                          onClick={() => setFollow(true)}
                          disabled={follow}
                        >
                          Follow me
                        </button>
                        <button
                          onClick={() => {
                            live.stop();
                            setFollow(false);
                          }}
                        >
                          Stop location
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <strong>On campus? Find your position.</strong>
                      <span>
                        Use device GPS with your permission. Pan to pause
                        following.
                      </span>
                      <button onClick={locate}>Start live location</button>
                    </>
                  )}
                  {live.error && <span role="alert">{live.error}</span>}
                </div>
                {apiUnavailable && (
                  <div className="service-status" role="status">
                    <span>
                      Showing saved campus data. Account services are
                      reconnecting.
                    </span>
                    <button onClick={() => setRefresh((n) => n + 1)}>
                      Retry
                    </button>
                  </div>
                )}
                <div className="map-caption">
                  <span className="live-dot" />
                  <span>
                    {historical ? "HISTORICAL CAMPUS PLAN" : "OPENSTREETMAP"}
                  </span>
                  <span className="map-caption-rule" />
                  <span>
                    {historical
                      ? "Reference only · not to scale"
                      : `${mappedPlaces.filter((p) => p.building_code).length} labels · brown = approximate`}
                  </span>
                </div>
                <button
                  className="mobile-directory-toggle"
                  onClick={() => setMobileList((s) => !s)}
                >
                  <Menu size={18} />
                  {mobileList ? "Show map" : "Show places"}
                </button>
                {selected &&
                  !(follow && live.enabled && selected.latitude != null) && (
                    <div className="detail-card">
                      <button
                        className="close"
                        aria-label="Close place details"
                        onClick={() => setSelected(null)}
                      >
                        <X size={18} />
                      </button>
                      <span className="eyebrow">
                        {selected.category}
                        {selected.old_map_id
                          ? ` / MAP ${selected.old_map_id}`
                          : ""}
                      </span>
                      <h2>{selected.name}</h2>
                      {selected.number_basis === "campus_plan" && (
                        <p>
                          Approximate position from LPU’s campus plan. Check the
                          building sign on arrival; names and numbering may have
                          changed.
                        </p>
                      )}
                      {selected.plan_code &&
                        selected.plan_code !== selected.building_code && (
                          <p>Campus plan label: {selected.plan_code}</p>
                        )}
                      <p>
                        {selected.description ??
                          (selected.historical
                            ? "This place appears on the supplied historical campus map. Its current name, use, and location need verification."
                            : "Campus location information submitted for review.")}
                      </p>
                      <div className="status-note">
                        <Info size={16} />
                        {selected.historical
                          ? draft?.place.id === selected.id &&
                            selected.latitude != null
                            ? "Your unverified preview. Not a published campus location."
                            : "Reference number only. GPS position needs verification before placing it on the live map."
                          : selected.verification_status.replaceAll("_", " ")}
                      </div>
                      {selected.historical && (
                        <div className="gps-place-action">
                          <button
                            className="outline-button"
                            onClick={() => setSuggestPlace(selected)}
                          >
                            I’m at this place · add GPS
                          </button>
                          <small>
                            Capture its entrance for review. No public pin is
                            added automatically.
                          </small>
                        </div>
                      )}
                      {draft?.place.id === selected.id && (
                        <button
                          className="subtle-link"
                          onClick={() => {
                            setDraft(null);
                            setSelected(draft.place);
                          }}
                        >
                          Clear my unverified pin
                        </button>
                      )}
                      {selected.building_code && (
                        <p>
                          <strong>Block {selected.building_code}</strong>
                        </p>
                      )}
                      {selected.building_source_url && (
                        <a
                          className="source-link"
                          href={selected.building_source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Building number source <ArrowUpRight size={12} />
                        </a>
                      )}
                      {selected.source_url && (
                        <a
                          className="source-link"
                          href={selected.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View source
                          <ArrowUpRight size={12} />
                        </a>
                      )}
                      {selected.facilities?.map((f) => (
                        <p key={f.name}>
                          {f.name} ·{" "}
                          {f.verification_status.replaceAll("_", " ")}
                        </p>
                      ))}
                      {selected.announcements?.map((a) => (
                        <p key={a.id}>
                          <strong>{a.title}</strong>
                          <br />
                          {a.description}
                        </p>
                      ))}
                      {selected.phone && <p>{selected.phone}</p>}
                      {Boolean(selected.opening_hours) && (
                        <p>Hours: {JSON.stringify(selected.opening_hours)}</p>
                      )}
                      <div className="detail-actions">
                        <button
                          className="primary-button"
                          disabled={
                            selected.historical ||
                            selected.snapshot ||
                            selected.latitude == null
                          }
                          onClick={() => {
                            setView("directions");
                            setHistorical(false);
                          }}
                        >
                          <Navigation size={16} />
                          Directions
                        </button>
                        <button
                          className="icon-button"
                          title="Save favorite"
                          aria-label="Save favorite"
                          disabled={selected.historical || selected.snapshot}
                          onClick={() =>
                            user
                              ? post("/favorites", { location_id: selected.id })
                                  .then(() =>
                                    setNotice("Saved to your places."),
                                  )
                                  .catch((e) => setNotice(e.message))
                              : setView("profile")
                          }
                        >
                          <Bookmark size={18} />
                        </button>
                        <button
                          className="icon-button"
                          title="Report information"
                          aria-label="Report information"
                          onClick={() =>
                            user ? setReport(selected) : setView("profile")
                          }
                        >
                          <Flag size={18} />
                        </button>
                      </div>
                      <button
                        className="subtle-link"
                        disabled={
                          selected.historical || selected.latitude == null
                        }
                        onClick={() => {
                          setNearbyOrigin([
                            selected.latitude!,
                            selected.longitude!,
                          ]);
                          setNearby(true);
                          setHistorical(false);
                          setSelected(null);
                        }}
                      >
                        Find nearby facilities
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
              </section>
            </div>
          ) : view === "assistant" ? (
            <Assistant />
          ) : view === "conversations" ? (
            <Conversations user={user} />
          ) : view === "announcements" ? (
            <Announcements />
          ) : view === "admin" && user?.role === "ADMIN" ? (
            <Admin
              categories={categories}
              notify={(message) => {
                setNotice(message);
                setRefresh((n) => n + 1);
              }}
            />
          ) : (
            <Profile user={user} setUser={setUser} notify={setNotice} />
          )}
          <footer className="page-footer">
            <span>
              <Compass size={15} />
              Made for finding your way.
            </span>
            <span>Independent student project · Not affiliated with LPU</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div role="status" className="toast">
          <Check size={17} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {report && (
        <Report
          place={report}
          close={() => setReport(null)}
          notify={setNotice}
        />
      )}
      {suggestPlace && (
        <LocationSuggestion
          place={suggestPlace}
          user={user}
          initialFix={draft?.place.id === suggestPlace.id ? draft.fix : null}
          close={() => setSuggestPlace(null)}
          signIn={() => {
            setSuggestPlace(null);
            setView("profile");
          }}
          notify={setNotice}
          preview={(fix) => {
            setHistorical(false);
            setDraft({
              place: { ...suggestPlace, latitude: null, longitude: null },
              fix,
            });
            setSelected({
              ...suggestPlace,
              latitude: fix.latitude,
              longitude: fix.longitude,
            });
            setFollow(false);
            setMobileList(false);
          }}
        />
      )}
    </div>
  );
}

function Directions({
  places: initialPlaces,
  selected,
  onRoute,
  onHistorical,
}: {
  places: Place[];
  selected: Place | null;
  onRoute: (points: [number, number][]) => void;
  onHistorical: () => void;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(selected?.historical ? "" : (selected?.id ?? "")),
    [accessible, setAccessible] = useState(false),
    [approximate, setApproximate] = useState(true),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const externalDirections = walkingDirectionsUrl(
    places.find((p) => p.id === from),
    places.find((p) => p.id === to),
  );
  useEffect(() => {
    setResult(null);
    setError("");
    onRoute([]);
  }, [from, to, accessible, approximate]);
  useEffect(() => {
    onHistorical();
    api("/locations")
      .then((d) => setPlaces(d.items))
      .catch((e) => setError(e.message));
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (from === to) {
      setError("Choose two different buildings.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    onRoute([]);
    try {
      const data = await post("/routes", {
        from,
        to,
        accessible,
        allow_approximate: approximate && !accessible,
      });
      setResult(data);
      onRoute(data.coordinates);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="form-panel">
      <div className="eyebrow">A WALK ACROSS CAMPUS</div>
      <h2>Get directions</h2>
      <p>
        Follow mapped campus paths. Building entrances may need confirmation.
      </p>
      <form onSubmit={submit}>
        <label>
          Starting point
          <select
            required
            disabled={busy}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          >
            <option value="">Choose a place</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destination
          <select
            required
            disabled={busy}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">Choose a place</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={approximate}
            disabled={accessible || busy}
            onChange={(e) => setApproximate(e.target.checked)}
          />
          Allow nearby mapped paths when entrances are unverified
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={accessible}
            disabled={busy}
            onChange={(e) => setAccessible(e.target.checked)}
          />
          Require an accessibility-verified route
        </label>
        <button
          className="primary-button"
          disabled={busy || places.length === 0}
        >
          <RouteIcon size={17} />
          {busy ? "Finding route…" : "Find walking route"}
        </button>
      </form>
      {places.length === 0 && (
        <div className="status-note">
          <Info size={18} />
          <span>
            Directions will be available after current entrances and walking
            paths are verified. The historical plan cannot provide reliable
            distances.
          </span>
        </div>
      )}
      {error && !(externalDirections && !accessible) && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {error && externalDirections && !accessible && (
        <div className="route-summary" role="status">
          <h3>Continue with Google Maps</h3>
          <p>{error}</p>
          <p>
            Both selected buildings are filled in. Google Maps will check its
            walking routes; building access still needs confirmation.
          </p>
          <a
            className="primary-button"
            href={externalDirections}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowUpRight size={17} /> Try Google Maps walking directions
          </a>
          <p>
            Opens in a new tab. Approximate building pins may need adjustment.
          </p>
        </div>
      )}
      {result && (
        <div className="route-summary">
          {result.approximate_endpoints && (
            <strong>Approximate mapped-path guidance</strong>
          )}
          <h3>
            {Math.round(result.distance_m)} m ·{" "}
            {Math.ceil(result.estimated_seconds / 60)} min
          </h3>
          <p>{result.notice}</p>
          <ol>
            {result.steps.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
function Profile({
  user,
  setUser,
  notify,
}: {
  user: User | null;
  setUser: (u: User | null) => void;
  notify: (text: string) => void;
}) {
  const [mode, setMode] = useState<
    "login" | "register" | "forgot-password" | "reset-password"
  >(
    new URLSearchParams(location.search).has("reset")
      ? "reset-password"
      : "login",
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [suggestion, setSuggestion] = useState("");
  useEffect(() => {
    if (user) {
      api("/favorites")
        .then(setSaved)
        .catch(() => {});
      api("/history")
        .then(setHistory)
        .catch(() => {});
    }
  }, [user]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await post(`/auth/${mode}`, {
        email,
        password,
        token: new URLSearchParams(location.search).get("reset"),
      });
      if (d.user) setUser(d.user);
      else notify(d.message);
      if (mode === "reset-password") {
        historyReplace();
        setMode("login");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (user)
    return (
      <section className="content-panel">
        <div className="eyebrow">YOUR ACCOUNT</div>
        <h2>{user.email}</h2>
        <p>{user.role.toLowerCase()} account</p>
        <button
          className="outline-button"
          onClick={() =>
            post("/auth/logout", {})
              .then(() => setUser(null))
              .catch((e) => notify(e.message))
          }
        >
          <LogOut size={16} />
          Sign out
        </button>
        <h3>Saved places</h3>
        {saved.length ? (
          saved.map((p) => (
            <div className="saved-row" key={p.id}>
              {p.name}
              <button
                aria-label={`Remove ${p.name}`}
                onClick={() =>
                  post(`/favorites/${p.id}`, {}, "DELETE")
                    .then(() => setSaved((s) => s.filter((i) => i.id !== p.id)))
                    .catch((e) => notify(e.message))
                }
              >
                <X size={16} />
              </button>
            </div>
          ))
        ) : (
          <p>No saved current locations yet.</p>
        )}
        <h3>Recent searches</h3>
        {history.length ? (
          history.slice(0, 8).map((h) => <p key={h.id}>{h.query}</p>)
        ) : (
          <p>Your recent searches will appear here.</p>
        )}
        <h3>Suggest a campus update</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            post("/submissions", { description: suggestion })
              .then(() => {
                notify("Your suggestion is pending administrator review.");
                setSuggestion("");
              })
              .catch((e) => notify(e.message));
          }}
        >
          <label>
            New location, facility, or temporary closure
            <textarea
              required
              minLength={10}
              maxLength={5000}
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="Include the name, source, and any details that need review."
            />
          </label>
          <button className="primary-button">Submit for review</button>
        </form>
      </section>
    );
  return (
    <section className="content-panel auth-panel">
      <div className="eyebrow">MAKE CAMPUS YOUR OWN</div>
      <h2>
        {mode === "register"
          ? "Create your account"
          : mode === "forgot-password"
            ? "Reset your password"
            : mode === "reset-password"
              ? "Choose a new password"
              : "Welcome back."}
      </h2>
      <p>Save places and help keep campus information up to date.</p>
      <form onSubmit={submit}>
        {mode !== "reset-password" && (
          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
        )}
        {mode !== "forgot-password" && (
          <label>
            Password
            <input
              type="password"
              required
              minLength={mode === "login" ? 1 : 12}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            <small>
              {mode !== "login"
                ? "At least 12 characters; no more than 72 UTF-8 bytes."
                : ""}
            </small>
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : mode === "register"
                ? "Create account"
                : "Reset password"}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className="auth-links">
        <button
          onClick={() => {
            setMode(mode === "register" ? "login" : "register");
            setError("");
          }}
        >
          {mode === "register"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        <button
          onClick={() => {
            setMode("forgot-password");
            setError("");
          }}
        >
          Forgot password?
        </button>
      </div>
    </section>
  );
}
function historyReplace() {
  window.history.replaceState({}, "", window.location.pathname);
}
function Report({
  place,
  close,
  notify,
}: {
  place: Place;
  close: () => void;
  notify: (s: string) => void;
}) {
  const [description, setDescription] = useState(""),
    [type, setType] = useState("OTHER"),
    [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const items = dialog.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input, select, textarea, a[href]",
      );
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [close]);
  return (
    <div className="modal-scrim">
      <section
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
      >
        <button className="close" onClick={close} aria-label="Close report">
          <X />
        </button>
        <h2 id="report-title">Help improve this place</h2>
        <p>{place.name}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            post(
              place.historical ? "/submissions" : "/reports",
              place.historical
                ? { description, historical_id: place.id }
                : { location_id: place.id, report_type: type, description },
            )
              .then(() => {
                notify(
                  "Submitted for review. Published information has not changed.",
                );
                close();
              })
              .catch((e) => setError(e.message));
          }}
        >
          <label>
            What needs updating?
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                "WRONG_LOCATION",
                "WRONG_NAME",
                "WRONG_CATEGORY",
                "WRONG_OPENING_HOURS",
                "MISSING_FACILITY",
                "CLOSED_LOCATION",
                "DUPLICATE_LOCATION",
                "OTHER",
              ].map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Details
            <textarea
              autoFocus
              required
              minLength={10}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="primary-button">Send correction</button>
        </form>
      </section>
    </div>
  );
}
function Assistant() {
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState<
      { role: string; text: string; sources?: any[] }[]
    >([]),
    [busy, setBusy] = useState(false);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "you", text: q }]);
    setBusy(true);
    try {
      const a = await post("/assistant", { question: q });
      setMessages((m) => [
        ...m,
        { role: "assistant", text: a.answer, sources: a.sources },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: (e as Error).message },
      ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-panel assistant-panel">
      <div className="assistant-intro">
        <div className="assistant-icon">
          <MessageCircle size={28} />
        </div>
        <div className="eyebrow">CAMPUS ASSISTANT</div>
        <h2>Start with a question.</h2>
        <p>
          Answers grounded in the campus directory.
          <br />
          When a detail is unknown, we’ll say so.
        </p>
      </div>
      <div className="suggested-questions">
        {[
          "What is on the historical map?",
          "Where is the hospital?",
          "How do I get to the library?",
        ].map((q) => (
          <button key={q} onClick={() => setQuestion(q)}>
            {q}
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
      <div className="messages" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <small>{m.role === "you" ? "YOU" : "CAMPUS ASSISTANT"}</small>
            <p>{m.text}</p>
            {m.sources?.map((s, i) => (
              <span className="source-tag" key={i}>
                {s.title} · {s.verification_status}
              </span>
            ))}
          </div>
        ))}
        {busy && <p>Checking campus records…</p>}
      </div>
      <form className="chat-input" onSubmit={ask}>
        <input
          aria-label="Ask the campus assistant"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          placeholder="Ask about a place or facility…"
        />
        <button aria-label="Send question" disabled={busy || !question.trim()}>
          <Send size={20} />
        </button>
      </form>
      <small className="assistant-footnote">
        Historical sources cannot confirm current routes, hours, or facilities.
      </small>
    </section>
  );
}
function Announcements() {
  const [items, setItems] = useState<any[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden) return;
      api("/announcements")
        .then((rows) => {
          if (active) {
            setItems(rows);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="content-panel">
      <div className="eyebrow">CAMPUS UPDATES</div>
      <h2>Announcements</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : items === null ? (
        <p>Loading updates…</p>
      ) : items.length ? (
        items.map((a) => (
          <article className="announcement" key={a.id}>
            <h3>{a.title}</h3>
            <p>{a.description}</p>
            <small>{new Date(a.start_date).toLocaleDateString()}</small>
          </article>
        ))
      ) : (
        <div className="empty">
          <Megaphone />
          <h3>No active announcements</h3>
          <p>Reviewed campus updates will appear here.</p>
        </div>
      )}
    </section>
  );
}

function Admin({
  categories,
  notify,
}: {
  categories: { id: number; name: string }[];
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [category, setCategory] = useState(""),
    [description, setDescription] = useState(""),
    [source, setSource] = useState(""),
    [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [operatingStatus, setOperatingStatus] = useState("UNKNOWN"),
    [editing, setEditing] = useState<any>(null),
    [newCategory, setNewCategory] = useState(""),
    [buildingCode, setBuildingCode] = useState(""),
    [phone, setPhone] = useState(""),
    [website, setWebsite] = useState(""),
    [hours, setHours] = useState<Record<string, string>>({});
  const load = () =>
    api("/admin/dashboard")
      .then((rows) =>
        setData({
          categories: [],
          sources: [],
          announcements: [],
          facilities: [],
          ...rows,
        }),
      )
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const action = (path: string, body: any, method = "POST") =>
    post(path, body, method)
      .then(() => {
        notify("Change saved.");
        load();
      })
      .catch((e) => notify(e.message));
  function edit(p: any) {
    setBuildingCode(p.building_code ?? "");
    setPhone(p.phone ?? "");
    setWebsite(p.website ?? "");
    setHours(p.opening_hours ?? {});
    setEditing(p);
    setName(p.name);
    setCategory(String(p.category_id));
    setDescription(p.description ?? "");
    setSource(p.source_id);
    setLat(p.latitude == null ? "" : String(p.latitude));
    setLng(p.longitude == null ? "" : String(p.longitude));
    setOperatingStatus(p.status);
  }
  return (
    <section className="content-panel admin-panel">
      <div className="eyebrow">ADMINISTRATION</div>
      <h2>Campus information</h2>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Loading dashboard…</p>
      ) : (
        <>
          <div className="stats">
            {Object.entries(data.stats).map(([k, v]) => (
              <div key={k}>
                <strong>{String(v)}</strong>
                <span>{k.replaceAll("_", " ")}</span>
              </div>
            ))}
          </div>
          <AnnouncementEditor
            items={data.announcements}
            locations={data.locations}
            reload={() => {
              load();
              notify("Announcements updated.");
            }}
          />
          <div className="admin-columns">
            <section>
              <h3>{editing ? "Edit location" : "Add current location"}</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await post(
                      editing
                        ? `/admin/locations/${editing.id}`
                        : "/admin/locations",
                      {
                        name,
                        category_id: Number(category),
                        description,
                        source_id: source,
                        latitude: lat === "" ? null : Number(lat),
                        longitude: lng === "" ? null : Number(lng),
                        version: editing?.version,
                        status: operatingStatus,
                        opening_hours: hours,
                        phone: phone || null,
                        website: website || null,
                        building_code: buildingCode || null,
                      },
                      editing ? "PUT" : "POST",
                    );
                    setBuildingCode("");
                    setPhone("");
                    setWebsite("");
                    setHours({});
                    setEditing(null);
                    setName("");
                    setDescription("");
                    setLat("");
                    setLng("");
                    setOperatingStatus("UNKNOWN");
                    notify("Location saved as unverified.");
                    load();
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <label>
                  Name
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Category
                  <select
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Select category</option>
                    {(data.categories ?? categories).map(
                      (c: { id: number; name: string }) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Evidence source
                  <select
                    required
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">Select current evidence</option>
                    {data.sources
                      .filter((s: any) => s.type !== "OLD_LPU_MAP")
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Building / block number
                  <input
                    value={buildingCode}
                    onChange={(e) => setBuildingCode(e.target.value)}
                    maxLength={80}
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={80}
                  />
                </label>
                <label>
                  Website
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
                <details>
                  <summary>Opening hours</summary>
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((day) => (
                    <label key={day}>
                      {day}
                      <input
                        placeholder="09:00-17:00 or Closed"
                        value={hours[day] ?? ""}
                        onChange={(e) =>
                          setHours((h) => ({ ...h, [day]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </details>
                <label>
                  Description
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <div className="field-pair">
                  <label>
                    Latitude
                    <input
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                    />
                  </label>
                  <label>
                    Longitude
                    <input
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Operating status
                  <select
                    value={operatingStatus}
                    onChange={(e) => setOperatingStatus(e.target.value)}
                  >
                    {["UNKNOWN", "ACTIVE", "TEMPORARILY_CLOSED", "CLOSED"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </label>
                <button className="primary-button">Save location</button>
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setName("");
                      setCategory("");
                      setSource("");
                      setDescription("");
                      setLat("");
                      setLng("");
                      setBuildingCode("");
                      setPhone("");
                      setWebsite("");
                      setHours({});
                      setOperatingStatus("UNKNOWN");
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </form>
              <AdminTools
                data={data}
                reload={() => {
                  load();
                  notify("Record saved.");
                }}
              />
              <details>
                <summary>Advanced path and record editor</summary>
                <p>
                  Manage sourced walking paths, entrances, and additional
                  records.
                </p>
                <AdminRecord action={action} />
              </details>
              <h3>Add category</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action("/admin/categories", { name: newCategory });
                  setNewCategory("");
                }}
              >
                <input
                  aria-label="Category name"
                  required
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <button className="outline-button">Add category</button>
              </form>
            </section>
            <section>
              <h3>Current locations</h3>
              {data.locations.map((p: any) => (
                <div className="admin-record" key={p.id}>
                  <strong>{p.name}</strong>
                  <small>{p.verification_status}</small>
                  <button onClick={() => edit(p)}>Edit</button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${p.name}? Associated favorites and evidence will be removed.`,
                        )
                      )
                        action(`/admin/locations/${p.id}`, {}, "DELETE");
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
              <h3>Moderation queue</h3>
              {data.reports.length + data.submissions.length === 0 && (
                <p>No pending corrections.</p>
              )}
              {[
                ...data.reports.map((r: any) => ({ ...r, kind: "reports" })),
                ...data.submissions.map((r: any) => ({
                  ...r,
                  kind: "submissions",
                })),
              ].map((r: any) => (
                <div className="admin-record" key={`${r.kind}${r.id}`}>
                  <p>{r.description ?? r.payload?.description}</p>
                  {r.payload?.suggested_latitude != null && (
                    <p>
                      <strong>
                        GPS suggestion · {r.payload.historical_id}
                      </strong>
                      <br />
                      {r.payload.suggested_latitude},{" "}
                      {r.payload.suggested_longitude} · accuracy ±
                      {r.payload.accuracy_m} m<br />
                      Captured {r.payload.captured_at} ·{" "}
                      {r.payload.location_consent
                        ? "Sharing consent recorded"
                        : "No recorded consent"}
                      <br />
                      Resolve only after independently verifying and recording
                      the location with its source.
                    </p>
                  )}
                  <button
                    onClick={() =>
                      action(
                        `/admin/${r.kind}/${r.id}`,
                        {
                          status: "RESOLVED",
                          admin_comment:
                            "Reviewed; any necessary data change must be recorded separately.",
                        },
                        "PATCH",
                      )
                    }
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() =>
                      action(
                        `/admin/${r.kind}/${r.id}`,
                        {
                          status: "REJECTED",
                          admin_comment: "Not accepted after review.",
                        },
                        "PATCH",
                      )
                    }
                  >
                    Reject
                  </button>
                </div>
              ))}
              <h3>Users</h3>
              {data.users.map((u: any) => (
                <div className="admin-record" key={u.id}>
                  <span>{u.email}</span>
                  <select
                    aria-label={`Role for ${u.email}`}
                    value={u.role}
                    onChange={(e) => {
                      if (confirm(`Change role for ${u.email}?`))
                        action(
                          `/admin/users/${u.id}`,
                          { role: e.target.value },
                          "PATCH",
                        );
                    }}
                  >
                    {["VISITOR", "STUDENT", "FACULTY", "ADMIN"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              ))}
              <h3>Recent audit activity</h3>
              {data.audit.map((a: any) => (
                <p key={a.id}>
                  {a.action} · {a.entity_type} #{a.entity_id}
                </p>
              ))}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
function AdminRecord({
  action,
}: {
  action: (path: string, body: any, method?: string) => any;
}) {
  const [kind, setKind] = useState("sources"),
    [json, setJson] = useState("{}"),
    [method, setMethod] = useState("POST"),
    [recordId, setRecordId] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          setError("");
          if (
            method === "DELETE" &&
            !confirm(`Delete ${kind} record ${recordId}?`)
          )
            return;
          action(
            `/admin/${kind}${method === "POST" ? "" : `/${recordId}`}`,
            method === "DELETE" ? {} : JSON.parse(json),
            method,
          );
        } catch {
          setError("Enter valid JSON.");
        }
      }}
    >
      <label>
        Record type
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setMethod("POST");
          }}
        >
          {[
            "sources",
            "announcements",
            "facilities",
            "path-nodes",
            "path-edges",
            "entrances",
            "verification",
          ].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      {["path-edges", "announcements"].includes(kind) && (
        <label>
          Action
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="POST">Create</option>
            <option value={kind === "path-edges" ? "PATCH" : "PUT"}>
              Update
            </option>
            <option value="DELETE">Delete</option>
          </select>
        </label>
      )}
      {method !== "POST" && (
        <label>
          Record ID
          <input
            type="number"
            min="1"
            required
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
          />
        </label>
      )}
      <label>
        Record JSON
        <textarea
          className="json-input"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="outline-button">Save record</button>
    </form>
  );
}
