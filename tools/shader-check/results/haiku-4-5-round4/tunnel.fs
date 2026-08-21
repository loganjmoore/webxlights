/*{
  "DESCRIPTION": "Spinning tunnel effect with color-shifting rings",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 8.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord - vec2(0.5, 0.5);
  
  float dist = length(uv);
  float angle = atan(uv.y, uv.x);
  
  float tunnel = 1.0 / (dist + 0.1);
  
  float depth = fract(dist * scale - TIME * speed);
  float rings = step(0.5, fract(depth * 3.0));
  
  float spin = angle + TIME * speed * 2.0;
  float rotated = mod(spin, 6.28318530718);
  
  vec3 col = mix(colorA.rgb, colorB.rgb, step(3.14159265359, rotated));
  col = mix(col, colorC.rgb, step(0.5, fract(rotated / 3.14159265359)));
  
  col = col * (0.5 + 0.5 * rings) * clamp(tunnel * 0.3, 0.0, 1.0);
  
  gl_FragColor = vec4(col, 1.0);
}
