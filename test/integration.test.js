import BigFinishProvider from '../provider';

describe('BigFinishProvider Integration', () => {
  let provider;

  beforeAll(() => {
    provider = new BigFinishProvider();
  });

  test('search should return results for a valid query', async () => {
    const results = await provider.getFullMetadata({
      id: '12345',
      // title: 'Classic Doctors New Monsters 1',
      url: 'https://www.bigfinish.com/releases/v/doctor-who-classic-doctors-new-monsters-1-1315',
    }, 'fallen angels');

    expect(results).toMatchSnapshot();
  });
  
  test("searching for 'zagreus' should return results", async () => {
    const results = await provider.searchBooks('zagreus');
    expect(results).toBeDefined();
    expect(results.matches.length).toBeGreaterThan(0);

    const zagreusResult = results.matches.find(match => match.id === 'doctor-who-zagreus-216');
    expect(zagreusResult).toMatchSnapshot();
  });

  test("searching for 'jabari countdown' should return results", async () => {
    const results = await provider.searchBooks('jabari countdown');
    expect(results).toBeDefined();
    expect(results.matches.length).toBeGreaterThan(0);

    const wantedResult = results.matches.find(match => match.id === 'doctor-who-the-seventh-doctor-new-adventures-volume-01-1882');
    expect(wantedResult).toMatchSnapshot();
  });

  test("searching for 'power play' should return results", async () => {
    const results = await provider.searchBooks('power play');
    expect(results).toBeDefined();
    expect(results.matches.length).toBeGreaterThan(0);

    const wantedResult = results.matches.find(match => match.id === 'doctor-who-power-play-417');
    expect(wantedResult).toMatchSnapshot();
  });

  test("searching for 'blood of the daleks' should return results", async () => {
    const results = await provider.searchBooks('blood of the daleks');
    expect(results).toBeDefined();
    expect(results.matches.length).toBeGreaterThan(0);

    expect(results.matches).toMatchSnapshot();
  });

  test("searching for 'exterminators' should return results", async () => {
    const results = await provider.searchBooks('exterminators');
    expect(results).toBeDefined();
    expect(results.matches.length).toBeGreaterThan(0);

    expect(results.matches.find(m => m.id === 'dalek-empire-the-exterminators-353')).toMatchSnapshot();
  });

  test("searching for 'project infinity' should return results", async () => {
    const results = await provider.searchBooks('project infinity');
    expect(results).toBeDefined();
    expect(results.matches.length).toBeGreaterThan(0);

    expect(results.matches.find(m => m.id === 'dalek-empire-project-infinity-358')).toMatchSnapshot();
  });

  test("searching for 'satanic mill' should return results", async () => {
    const results = await provider.searchBooks('satanic mill');
    expect(results).toBeDefined();
    expect(results.matches.length).toBeGreaterThan(0);

    expect(results.matches.find(m => m.id === 'doctor-who-doom-coalition-1-1221')).toMatchSnapshot();
  });
});
