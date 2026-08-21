/*{
  "DESCRIPTION": "Slow drifting lava lamp blobs that merge and separate",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.1, 0.0, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "blobSize", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.15;

  // work in a normalized aspect-corrected space
  vec2 p = uv;
  p.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

  float field = 0.0;

  // three slow blobs, each drifting on its own lazy loop
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float phase = fi * 2.094395; // spread around a cycle

    vec2 center;
    if (isLine) {
      // squash vertical motion into horizontal drift for a roofline
      float cx = 0.5 + 0.5 * sin(t * 0.8 + phase) + 0.15 * sin(t * 1.3 + phase * 2.0);
      center = vec2(fract(cx * 1.3 + fi * 0.33) * (RENDERSIZE.x / max(RENDERSIZE.y, 1.0)), 0.5);
    } else {
      float cx = 0.5 + 0.35 * sin(t * 0.7 + phase);
      float cy = 0.5 + 0.35 * cos(t * 0.55 + phase * 1.7);
      center = vec2(cx * (RENDERSIZE.x / max(RENDERSIZE.y, 1.0)), cy);
    }

    float d = length(p - center);
    float r = 0.22 * blobSize;
    field += r * r / max(d * d, 0.0001);
  }

  // metaball-style threshold with soft edge
  float glow = smoothstep(0.6, 1.4, field);
  float core = smoothstep(1.2, 2.2, field);

  vec3 col = mix(colorC.rgb, colorA.rgb, glow);
  col = mix(col, colorB.rgb, core);

  gl_FragColor = vec4(col, 1.0);
}
