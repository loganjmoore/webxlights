/*{
  "DESCRIPTION": "A spinning tunnel you fly through with rotating stripes",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 8.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord - vec2(0.5, 0.5);
  
  float dist = length(uv);
  float angle = atan(uv.y, uv.x);
  
  float depth = 1.0 / (dist + 0.1);
  float spin = angle + TIME * speed;
  
  float pattern = fract(spin / 6.283185307 * scale + depth * 2.0);
  float band = step(0.5, pattern);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, band);
  float brightness = smoothstep(0.0, 1.0, depth * 0.8);
  
  gl_FragColor = vec4(color * brightness, 1.0);
}
