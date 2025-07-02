# bfpsearch-abs

Audiobookshelf Custom Metadata Provider for BigFinish.com

Forked from [the original](https://github.com/JarrodMiller/bfpsearch-abs).

Takes metadata from the Big Finish website, and works as of 2nd July 2025. If the site changes, this will probably stop working.

Tries to tag series as best it can. If it's a subseason of a range, e.g. Eighth
Doctor Adventures, it will try and tag with both the range as a series, and then
the numbered season within it.


##	Docker Image

ARM64 and AMD64 images available [on dockerhub](https://hub.docker.com/repository/docker/chooban/bfpsearch-abs/general).


##	Docker Compose Example

```yaml
  bfpsearch-abs:
    image: chooban/bfpsearch-abs
    container_name: bfpsearch-abs
    environment:
      - LANGUAGE=en
      - USE_CORS=false
      - USE_AUTH=false
    restart: unless-stopped
    ports:
      - "3001:3001"

```


##	Testing

Run `hurl --test hurlfile`. 
