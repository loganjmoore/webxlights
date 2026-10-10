/*{
  "DESCRIPTION": "A calm veil of light: slow waves crossing and interfering, glowing where they meet, split into the palette colours like light through a prism",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.2, 0.6, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.75, 0.3, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.55, 0.6, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.6, "MAX": 3.0, "DEFAULT": 1.5 }
  ]
}*/
// One layer of the veil. Three plane waves crossing at different angles add up to a field that
// is zero along curving ribbons, and the glow is brightest on those. Each layer is nudged a
// little in phase and angle from the last, which is the prism: the same light, bent a different
// amount for each colour. Every time frequency is a whole number of tenths, so the wrap at
// twenty pi is seamless.
float ribbon(vec2 w, float t, float k) {
  float s = sin(dot(w, vec2(1.3, 0.4 + 0.15 * k)) + t * 0.3 + k * 0.6)
          + sin(dot(w, vec2(-0.6 - 0.1 * k, 1.7)) - t * 0.2 + k * 0.8)
          + sin(dot(w, vec2(0.9, 0.9 - 0.1 * k)) + t * 0.4 - k * 0.7);
  // A wide soft falloff, not a line: a thin ribbon would be a flicker on a low-resolution prop.
  return 1.0 / (1.0 + 2.2 * s * s);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(clamp(aspect, 0.5, 3.0), 1.0) * scale;
  if (isLine) p.y = 0.3 * sin(p.x * 1.1);
  float t = mod(TIME * speed, 62.831853);
  // A slow bend in the plane, so the ribbons curve instead of running straight.
  vec2 w = p + 0.4 * vec2(sin(p.y * 1.3 + t * 0.2), sin(p.x * 1.1 - t * 0.3));
  float ga = ribbon(w, t, 0.0);
  float gb = ribbon(w, t, 1.0);
  float gc = ribbon(w, t, 2.0);
  // Each pixel takes the colour of whichever layer is glowing there, with the layers blending
  // where they cross. Summing them instead would pile the three colours up into white.
  float wa = pow(ga, 4.0);
  float wb = pow(gb, 4.0);
  float wc = pow(gc, 4.0);
  vec3 hue = (colorA.rgb * wa + colorB.rgb * wb + colorC.rgb * wc) / (wa + wb + wc + 0.0000001);
  // Brighter where two ribbons cross: that is where a prism throws its light.
  float meet = ga * gb + gb * gc + gc * ga;
  // A second, finer veil in front of the first, shading it rather than colouring it: the
  // layering that gives the light depth without adding detail a prop could not show.
  float fine = ribbon(w * 2.1 + vec2(3.7, 1.9), t, 1.0);
  float lum = (0.56 + 0.36 * max(ga, max(gb, gc))) * (0.85 + 0.25 * fine);
  vec3 col = hue * lum + (0.5 + 0.5 * hue) * 0.22 * meet;
  gl_FragColor = vec4(min(col, 1.0), 1.0);
}
