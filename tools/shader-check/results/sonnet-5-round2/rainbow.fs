/*{
  "DESCRIPTION": "A saturated rainbow band sweeps across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

vec3 rainbow(float t) {
  float r = abs(fract(t + 0.0 / 3.0) * 6.0 - 3.0) - 1.0;
  float g = abs(fract(t + 2.0 / 3.0) * 6.0 - 3.0) - 1.0;
  float b = abs(fract(t + 1.0 / 3.0) * 6.0 - 3.0) - 1.0;
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

void main() {
  vec2 uv = isf_FragNormCoord;

  float pos = uv.x;
  if (RENDERSIZE.y < 2.0) {
    pos = uv.x;
  } else {
    pos = mix(uv.x, uv.y, 0.0);
  }

  float t = pos * scale - TIME * speed * 0.3;

  vec3 col = rainbow(t);

  float sat = mix(1.0, 2.2, sharpness);
  col = clamp((col - 0.5) * sat + 0.5, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
