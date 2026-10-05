// The static site: there is no backend, so the page searches a snapshot of the library, made by the static site export
const SNAPSHOT_URL = 'library.json';

const contains = (value, part) => (value || '').toLowerCase().includes(part.toLowerCase());

// the same rules as MovieSpecifications in the backend
function matches(movie, form) {
    if (form.title && ![movie.titlePt, movie.titleEn, movie.titleOriginal, movie.seriesName].some(t => contains(t, form.title))) {
        return false;
    }
    if (TEXT_FILTERS.some(f => f !== 'ageRating' && form[f] && !contains(movie[f], form[f]))) return false;
    if (form.ageRating && (movie.ageRating || '').toLowerCase() !== form.ageRating.toLowerCase()) return false;
    if (NUMBER_FILTERS.some(f => form[f] !== '' && movie[f] !== Number(form[f]))) return false;
    if (form.genres.length) {
        const movieGenres = (movie.genres || '').toLowerCase().split(', ');
        const hasGenre = g => movieGenres.includes(g.toLowerCase());
        return form.genreMatch === 'ANY' ? form.genres.some(hasGenre) : form.genres.every(hasGenre);
    }
    return true;
}

const snapshotDate = Vue.ref('');
let snapshot = null;

// loaded once; 'no-cache' so that a newly uploaded snapshot is picked up
function loadSnapshot() {
    snapshot ??= fetch(SNAPSHOT_URL, { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
    });
    return snapshot;
}

const snapshotDataSource = {
    findMovies: async form => (await loadSnapshot()).movies.filter(movie => matches(movie, form)),
    async loadRefData() {
        const { exportedAt, genres, ageRatings } = await loadSnapshot();
        snapshotDate.value = new Date(exportedAt).toLocaleDateString();
        return [genres, ageRatings];
    },
};

Vue.createApp({
    setup: () => ({ ...useMovieLibrary(snapshotDataSource), snapshotDate }),
}).mount('#app');
