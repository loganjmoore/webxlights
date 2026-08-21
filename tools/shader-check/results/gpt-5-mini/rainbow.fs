/*{
  "DESCRIPTION": "rainbow sweeping across",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bands", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 6.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.01, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "brightness", "TYPE": "float", "MIN": 0.0, "MAX": 3.0, "DEFAULT": 1.0 }
  ]
}*/
vec3 hsv2rgb(vec3 c) {
  vec3 k = vec3(0.0, 2.0/3.0, 1.0/3.0);
  vec3 p = abs(fract(vec3(c.x) + k) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - vec3(1.0), 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  // choose primary axis so narrow displays still show the sweep
  float p = (RENDERSIZE.x < 2.0) ? uv.y : uv.x;

  // moving position across the axis
  float pos = p * bands - TIME * speed * 0.2;
  float f = fract(pos); // 0..1 along each band

  // triangular stripe shape (0..0.5), scale to 0..1
  float tri = (0.5 - abs(f - 0.5)) * 2.0;

  // smooth the stripe edges using sharpness (edge in 0..1)
  float edge = clamp(sharpness, 0.01, 1.0);
  float mask = smoothstep(0.0, edge, tri);

  // hue varies across each band so the sweep shows full rainbow
  float hue = f; // 0..1
  vec3 rainbow = hsv2rgb(vec3(hue, 1.0, 1.0));

  // subtle vertical modulation so tall displays have depth, but keep effect visible on 1-pixel tall lines
  float vmod = mix(1.0, smoothstep(0.0, 1.0, uv.y), step(2.0, RENDERSIZE.y));

  vec3 col = rainbow * mask * vmod * brightness;

  // allow a simple tint from the user-chosen colorA
  col *= colorA.rgb;

  // keep fully opaque
  gl_FragColor = vec4(col, 1.0);
}
