/*{
  "DESCRIPTION": "A rainbow of color bands sweeps across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "brightness", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 1.0 }
  ]
}*/

vec3 rainbow(float t) {
  float h = fract(t);
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  c = c * c * (3.0 - 2.0 * c);
  return c;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float pos = RENDERSIZE.y < 2.0 ? uv.x : (uv.x + uv.y * 0.35);
  float t = pos * scale - TIME * speed * 0.5;

  vec3 col = rainbow(t);

  float bandCount = mix(1.0, 6.0, sharpness);
  float banded = floor(fract(t) * bandCount) / bandCount;
  vec3 colHard = rainbow(banded + t - fract(t));
  col = mix(col, colHard, sharpness);

  col *= brightness;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
