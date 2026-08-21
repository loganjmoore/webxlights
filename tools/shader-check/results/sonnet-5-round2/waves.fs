/*{
  "DESCRIPTION": "Layered ocean waves rolling across the display in blues and whitecaps",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.15, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.6, 0.8, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // If the buffer is tall (a real 2D grid), drive waves along y and layer with x.
  // If it is a single row (roofline), fold the same motion onto x alone.
  float isFlat = step(RENDERSIZE.y, 1.5);

  float t = TIME * speed;

  // Coordinate that carries the wave motion: y normally, x when flat.
  float wc = mix(uv.y, uv.x, isFlat);
  float xc = mix(uv.x, 0.5, isFlat);

  // Three layered waves of differing frequency/speed for rolling motion.
  float w1 = sin(wc * scale * 6.2831 + xc * 3.0 + t * 1.3);
  float w2 = sin(wc * scale * 10.0 - xc * 2.0 - t * 0.9 + 1.7);
  float w3 = sin(wc * scale * 3.0 + xc * 1.0 + t * 0.5 - 0.8);

  float wave = (w1 * 0.5 + w2 * 0.3 + w3 * 0.2);
  wave = wave * 0.5 + 0.5;

  // Base ocean gradient from deep to lighter blue.
  vec3 ocean = mix(colorA.rgb, colorB.rgb, wave);

  // Whitecap highlight where wave peaks are sharp.
  float crest = smoothstep(0.72, 0.95, wave);
  vec3 col = mix(ocean, colorC.rgb, crest);

  // Subtle horizontal roll shimmer so a flat roofline still reads motion.
  float shimmer = sin(uv.x * 20.0 * scale * 0.2 + t * 2.0) * 0.05;
  col += shimmer * crest;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
