FROM ubuntu:14.04
MAINTAINER Martin von Gagern <gagern@ma.tum.de>

# Install SPECIFIC versions of all dependencies, to ensure reproducibility.
# Then remove directories modified in the process, to keep the image small.
RUN apt-get -qq update && apt-get -qqy install \
    fontconfig-config=2.11.0-0ubuntu4.1        \
    fonts-dejavu-core=2.34-1ubuntu1            \
    libfontconfig1=2.11.0-0ubuntu4.1           \
    libfreetype6=2.5.2-1ubuntu2.4              \
    libjpeg-turbo8=1.3.0-0ubuntu2              \
    libjpeg8=8c-2ubuntu8                       \
    phantomjs=1.9.0-1                          \
    && rm -r                                   \
    /usr/share/doc                             \
    /var/cache/apt                             \
    /var/lib/apt                               \
    /var/lib/dpkg                              \
    /var/log/apt                               \
    && echo "Installed successfully."
ENTRYPOINT ["/usr/bin/phantomjs"]
