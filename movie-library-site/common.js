const { reactive, ref, computed, onMounted, onUnmounted } = Vue;

// 'title' is the main search box: it is matched against any of the titles and the series name
const TEXT_FILTERS = ['director', 'actors', 'country', 'language', 'plot', 'ageRating'];
const NUMBER_FILTERS = ['year', 'seasonNumber'];

const emptyForm = () => ({
    title: '', director: '', actors: '', year: '', seasonNumber: '', country: '', language: '', plot: '', ageRating: '',
    genres: [], genreMatch: 'ALL',
});

const pretty = value => value
    ? value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : '';

// The page logic shared by the dynamic page and the static site. They differ in the data source they give:
// findMovies(form, params) returns the movies matching the form (params is the form as URL parameters),
// loadRefData() returns [genres, ageRatings] as given by the reference data endpoints
function useMovieLibrary(dataSource) {
    const form = reactive(emptyForm());
    const showFilters = ref(false);
    const genres = ref([]);
    const ageRatings = ref([]);
    const results = ref([]);
    const loading = ref(false);
    const searched = ref(false);
    const error = ref('');
    const selected = ref(null);
    const sortBy = ref('title');
    const brokenPosters = reactive(new Set());
    const activeFilterCount = computed(() =>
        [...TEXT_FILTERS, ...NUMBER_FILTERS].filter(f => form[f] !== '').length + (form.genres.length ? 1 : 0));
    const hasCriteria = computed(() => !!form.title || activeFilterCount.value > 0);

    function buildParams() {
        const params = new URLSearchParams();
        if (form.title) params.append('title', form.title);
        TEXT_FILTERS.forEach(f => form[f] && params.append(f, form[f]));
        NUMBER_FILTERS.forEach(f => form[f] !== '' && params.append(f, form[f]));
        form.genres.forEach(g => params.append('genre', g));
        if (form.genres.length > 1) params.append('genreMatch', form.genreMatch);
        return params;
    }

    // without any criteria, all movies are returned
    async function search() {
        loading.value = true;
        error.value = '';
        syncUrl();
        try {
            results.value = await dataSource.findMovies(form, buildParams());
            searched.value = true;
        } catch (e) {
            error.value = 'The search failed: ' + e.message;
        } finally {
            loading.value = false;
        }
    }

    function browseAll() {
        Object.assign(form, emptyForm());
        search();
    }

    function clear() {
        Object.assign(form, emptyForm());
        results.value = [];
        searched.value = false;
        error.value = '';
        syncUrl();
    }

    function toggleGenre(genre) {
        const i = form.genres.indexOf(genre);
        i >= 0 ? form.genres.splice(i, 1) : form.genres.push(genre);
    }

    // keep the search in the address bar, so that it can be bookmarked or reloaded
    function syncUrl() {
        const query = buildParams().toString();
        history.replaceState(null, '', query ? '?' + query : location.pathname);
    }

    function restoreFromUrl() {
        const params = new URLSearchParams(location.search);
        form.title = params.get('title') || '';
        TEXT_FILTERS.forEach(f => form[f] = params.get(f) || '');
        NUMBER_FILTERS.forEach(f => form[f] = params.get(f) || '');
        form.genres = params.getAll('genre');
        form.genreMatch = params.get('genreMatch') || 'ALL';
        showFilters.value = activeFilterCount.value > 0;
        return params.toString() !== '';
    }

    const mainTitle = m => m.titlePt || m.titleEn || m.titleOriginal || '(untitled)';
    const otherTitle = m => [m.titleOriginal, m.titleEn].find(t => t && t !== mainTitle(m)) || '';
    // e.g. "Game of Thrones · S5E8"; empty for anything that is not a TV series episode
    const seriesLabel = m => {
        const episode = (m.seasonNumber != null ? 'S' + m.seasonNumber : '')
            + (m.episodeNumber != null ? 'E' + m.episodeNumber : '');
        return [m.seriesName, episode].filter(Boolean).join(' · ');
    };
    const imdbRating = m => {
        const points = m.ratingSet?.find(r => /imdb/i.test(r.source))?.points;
        return points ? points.split('/')[0] : '';
    };
    const locationLabel = p => [pretty(p.location), p.locationDetail !== 'UNDEFINED' ? pretty(p.locationDetail) : '']
        .filter(Boolean).join(' – ') || 'Unknown';
    const locations = m => [...new Set((m.productSet || []).map(locationLabel))].join(', ');
    const facts = m => [
        ['Director', m.director], ['Writers', m.writers], ['Cast', m.actors], ['Country', m.country],
        ['Language', m.language], ['Awards', m.awards],
    ].filter(f => f[1] && f[1] !== 'N/A');

    const hasRatings = computed(() => results.value.some(imdbRating));

    const sortedResults = computed(() => {
        const list = [...results.value];
        const byTitle = (a, b) => mainTitle(a).localeCompare(mainTitle(b), 'pt');
        const sorters = {
            title: byTitle,
            yearDesc: (a, b) => (b.year ?? 0) - (a.year ?? 0) || byTitle(a, b),
            yearAsc: (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || byTitle(a, b),
            rating: (a, b) => (parseFloat(imdbRating(b)) || 0) - (parseFloat(imdbRating(a)) || 0) || byTitle(a, b),
        };
        return list.sort(sorters[sortBy.value]);
    });

    const onKey = e => e.key === 'Escape' && (selected.value = null);

    onMounted(async () => {
        window.addEventListener('keydown', onKey);
        if (restoreFromUrl()) search();
        try {
            const [genreList, ageRatingList] = await dataSource.loadRefData();
            genres.value = genreList.map(g => g.abbreviation).filter(Boolean).sort();
            ageRatings.value = [...new Set(ageRatingList.map(r => r.imdb).filter(Boolean))].sort();
        } catch (e) {
            console.warn('Could not load the reference data', e);
        }
    });
    onUnmounted(() => window.removeEventListener('keydown', onKey));

    return {
        form, showFilters, genres, ageRatings, results, sortedResults, hasRatings, loading, searched, error, selected, sortBy,
        brokenPosters, activeFilterCount, hasCriteria, search, browseAll, clear, toggleGenre,
        mainTitle, otherTitle, seriesLabel, imdbRating, locations, locationLabel, facts,
    };
}
