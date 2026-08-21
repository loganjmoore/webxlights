/*{
  "DESCRIPTION": "Chasing light that runs smoothly along the roofline",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "width", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.1 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float isRoofline = step(RENDERSIZE.y, 2.0);
  float coord = mix(uv.x, uv.y, isRoofline);
  
  float chase = fract(coord - TIME * speed * 0.5);
  float pulse = smoothstep(width + 0.05, 0.0, abs(chase - 0.5) - 0.25);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, step(0.5, chase));
  vec3 final = mix(color * 0.2, color, pulse);
  
  gl_FragColor = vec4(final, 1.0);
}
