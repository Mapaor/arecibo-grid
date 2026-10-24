# Arecibo Grid

A minimal website to design custom binary messages, inspired by the [Arecibo message](https://en.wikipedia.org/wiki/Arecibo_message).

## Grid rules

- Width and height are primes between 2 and 2027.
- To keep the grid kinda "square-ish", only prime numbers with fewer than 25 primes between them are allowed. 

  *Note: You can fork this repo and remove this limitation if you want.*


## Export

### Plain text

The export is a plain text file, the first line contains `width height` and the next line the binary digits (red left to right, then top to bottom), `0` is an empty cell and `1` is a filled cell. Example:

```text
23 73
0110101010...
```

### SVG
You can export it as an SVG image as well.



## Development
This website works with Vite and Typescript.

To run it locally, clone the repo and then:

```sh
npm install
npm run dev
```

To test it for production, build it with:

```sh
npm run build
npm run preview
```

## License
MIT
