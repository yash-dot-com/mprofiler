"use client";

import React, { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon, BugAntIcon } from "@heroicons/react/24/outline";
import { FlowNavigation } from "~~/components/mprofiler/FlowNavigation";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
  },

  {
    label: "Debug Contracts",
    href: "/debug",
    icon: <BugAntIcon className="h-4 w-4" />,
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "bg-secondary shadow-md" : ""
              } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;
  const pathname = usePathname();
  const isProfilerPage = ["/", "/profile", "/compare", "/insights", "/debug"].includes(pathname);

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div
      className={`${isProfilerPage ? "border-b border-slate-100 bg-white" : "sticky top-0 z-20 navbar min-h-0 shrink-0 justify-between bg-base-100 px-0 shadow-md shadow-secondary sm:px-2 lg:static"}`}
    >
      {isProfilerPage ? (
        <div className="mx-auto flex min-h-[76px] w-full max-w-[1500px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-[-0.045em] text-[#111113]">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 place-items-center rounded-lg bg-[#111113] text-sm font-bold text-white"
              >
                M
              </span>
              MProfiler
            </Link>
          </div>
          {pathname === "/" && (
            <nav className="flex items-center gap-3 text-sm font-semibold text-slate-600 sm:gap-6">
              <Link href="/#workflow" className="hidden transition hover:text-slate-950 sm:inline">
                How it works
              </Link>
              <Link href="/#evidence" className="hidden transition hover:text-slate-950 md:inline">
                Evidence
              </Link>
              <a
                href="https://youtu.be/E0OgbbPYkLk"
                target="_blank"
                rel="noreferrer"
                className="hidden transition hover:text-slate-950 lg:inline"
              >
                Demo ↗
              </a>
              <Link
                href="/profile"
                className="rounded-xl bg-[#111113] px-4 py-2.5 text-white transition hover:bg-slate-700"
              >
                Start profiling
              </Link>
            </nav>
          )}
          {pathname !== "/" && pathname !== "/debug" && <FlowNavigation />}
          {pathname === "/debug" && (
            <Link href="/profile" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
              Back to workspace
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="navbar-start w-auto lg:w-1/2">
            <details className="dropdown" ref={burgerMenuRef}>
              <summary className="btn btn-ghost ml-1 hover:bg-transparent lg:hidden">
                <Bars3Icon className="h-1/2" />
              </summary>
              <ul
                className="menu menu-compact dropdown-content mt-3 w-52 rounded-box bg-base-100 p-2 shadow-sm"
                onClick={() => {
                  burgerMenuRef?.current?.removeAttribute("open");
                }}
              >
                <HeaderMenuLinks />
              </ul>
            </details>
            <Link href="/" passHref className="ml-4 mr-6 hidden shrink-0 items-center gap-2 lg:flex">
              <div className="relative flex h-10 w-10">
                <Image alt="SE2 logo" className="cursor-pointer" fill src="/logo.svg" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold leading-tight">Scaffold-ETH</span>
                <span className="text-xs">Ethereum dev stack</span>
              </div>
            </Link>
            <ul className="menu menu-horizontal hidden gap-2 px-1 lg:flex lg:flex-nowrap">
              <HeaderMenuLinks />
            </ul>
          </div>
          <div className="navbar-end mr-4 grow">
            <RainbowKitCustomConnectButton />
            {isLocalNetwork && <FaucetButton />}
          </div>
        </>
      )}
    </div>
  );
};
