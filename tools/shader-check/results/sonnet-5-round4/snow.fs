/*{
  "DESCRIPTION": "Gently falling snow flakes drifting down over a dark night sky",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "skyColor", "TYPE": "color", "DEFAULT": [0.02, 0.03, 0.1, 1.0] },
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 1.0, "MAX": 6.0, "DEFAULT": 3.0 },
    { "NAME": "flakeSize", "TYPE": "float", "MIN": 0.02, "MAX": 0.2, "DEFAULT": 0.08 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;

  vec3 col = skyColor.rgb;

  int layers = int(density);
  for (int i = 0; i < 6; i++) {
    if (i >= layers) break;

    float fi = float(i);
    float layerScale = 4.0 + fi * 3.0;
    float fallSpeed = (0.15 + fi * 0.08) * speed;
    float wobbleAmt = 0.15 / (1.0 + fi * 0.4);

    vec2 guv;
    if (isRoofline) {
      // drive the falling motion along x instead of y on a 1px-tall roofline
      float t = uv.x * layerScale + TIME * fallSpeed * 4.0;
      float wobble = sin(TIME * 0.6 + fi * 10.0) * wobbleAmt;
      guv = vec2(t, uv.y * layerScale + wobble + fi * 17.0);
    } else {
      float fallT = uv.y * layerScale + TIME * fallSpeed * 4.0;
      float wobble = sin(TIME * 0.8 + uv.y * 20.0 + fi * 10.0) * wobbleAmt;
      guv = vec2(uv.x * layerScale + wobble + fi * 13.0, fallT);
    }

    vec2 cell = floor(guv);
    vec2 f = fract(guv) - 0.5;

    vec2 jitter = vec2(hash(cell + fi), hash(cell + fi + 5.0)) - 0.5;
    jitter *= (1.0 - flakeSize * 2.0);

    float d = length(f - jitter);
    float flake = smoothstep(flakeSize, flakeSize * 0.3, d);

    float twinkle = 0.7 + 0.3 * sin(TIME * 2.0 + hash(cell) * 6.2831);
    col = mix(col, snowColor.rgb, flake * twinkle);
  }

  gl_FragColor = vec4(col, 1.0);
}
