/*{
  "DESCRIPTION": "Spinning concentric tunnel rings that fly toward the viewer",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "rings", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 6.0 },
    { "NAME": "spin", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  if (RENDERSIZE.y < 2.0) {
    // roofline fallback: fly-through becomes motion along x
    float x = fract(uv.x - TIME * speed * 0.3);
    float ring = fract(x * rings);
    float band = step(ring, 0.5);
    vec3 col = mix(colorA.rgb, colorB.rgb, band);
    float pulse = 0.5 + 0.5 * sin(uv.x * 20.0 - TIME * spin * 3.0);
    col = mix(col, colorC.rgb, smoothstep(0.85, 1.0, pulse) * 0.6);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  vec2 c = uv - vec2(0.5);
  float aspect = RENDERSIZE.x / RENDERSIZE.y;
  c.x *= aspect;

  float dist = length(c);
  dist = max(dist, 0.0001);

  float angle = atan(c.y, c.x);
  angle += spin * TIME;

  float depth = 1.0 / dist;
  float z = depth * 0.3 - TIME * speed * 2.0;

  float ringPattern = fract(z * (rings * 0.1));
  float band = step(ringPattern, 0.5);

  vec3 col = mix(colorA.rgb, colorB.rgb, band);

  float spokes = 0.5 + 0.5 * cos(angle * 6.0);
  col = mix(col, colorC.rgb, smoothstep(0.75, 1.0, spokes) * 0.5);

  float vig = smoothstep(1.4, 0.1, dist);
  col *= mix(0.3, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
